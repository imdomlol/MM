from bs4 import BeautifulSoup
import networkx as nx
from pyvis.network import Network
import requests
from requests.exceptions import RequestException
import os
import webbrowser
import tkinter as tk
from tkinter import ttk
import json
import math

background_color = "#212121"
fonts_color = "#FBF5E5"
main_node_color = "#A35C7A"
node_color = "#C890A7"
edge_color = "#C890A7"

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def get_html_content(local_path, url, login_url, username):
  """
  Attempts to log in and retrieve HTML content from the website.
  If the login/fetch fails, it falls back to the local file.
  """
  try:
      # Start a session so cookies persist
      session = requests.Session()

      # Depending on the site, the login may be a POST request or simply a GET request.
      # Here we assume the login form is submitted via POST with a 'username' field.
      login_payload = {"username": username}
      login_response = session.post(login_url, data=login_payload, timeout=10)
      login_response.raise_for_status()  # Ensure the login request succeeded

      # Now fetch the target page (make sure cookies are sent automatically)
      response = session.get(url, timeout=10)
      response.raise_for_status()
      html = response.text

      # Optionally, save the fresh copy to your local file
      with open(local_path, "w", encoding="utf-8") as f:
          f.write(html)
      print("Successfully fetched the latest copy from the website.")
      return html
  except RequestException as e:
      print("Failed to connect to the website or log in. Using local copy. Error:", e)
      with open(local_path, "r", encoding="utf-8") as f:
          return f.read()

def parse_mastercrafted_recipes(html_text):
  soup = BeautifulSoup(html_text, "html.parser")
  blacklist = []

  folder = soup.find("li", attrs={"data-folder-id": "dbBkOsI3RklpB2uX"})
  if folder:
      entries = folder.find_all("h4", class_="entry-name document-name")
      for h4 in entries:
          name = h4.get_text(strip=True)
          if name:
              blacklist.append(name)
  else:
      print("Could not find raw material folder in HTML.")

  # Normalize blacklist to lowercase for consistent comparison
  blacklist = [name.strip().lower() for name in blacklist]


  # STEP 2: Extract mastercrafted recipes
  recipe_divs = soup.find_all("div", class_="mastercrafted-recipe hidden")
  recipes = []

  for rd in recipe_divs:
      book_id = rd.get("data-book-id", "")
      recipe_id = rd.get("data-recipe-id", "")

      header = rd.find("header", class_="mastercrafted-recipe-header")
      if not header:
          continue
      title_el = header.find("h1")
      title = title_el.get_text(strip=True) if title_el else "Unknown"
      
      # Skip if title is blacklisted AND has no results (i.e., it's a base material, not a crafted product)
      results_wrap = rd.find("div", class_="mastercrafted-results")
      has_results = results_wrap and results_wrap.find("div", class_="mastercrafted-component")

      if not has_results:
        header = rd.find("header", class_="mastercrafted-recipe-header")
        if header:
            title_el = header.find("h1")
            title = title_el.get_text(strip=True) if title_el else None
            if title:
                blacklist.append(title)

      # Title is the <h1> text
      title_el = header.find("h1")
      title = title_el.get_text(strip=True) if title_el else "Unknown"

      # Capture required tools, time, skill requirements from paragraphs
      paragraphs = header.find_all("p")
      required_tools = None
      crafting_time = None
      skill_req = None
      for p in paragraphs:
          text = p.get_text(strip=True)
          if "Required Tools" in text:
              required_tools = text.split("Tools:")[-1].strip()
          elif "Crafting Time:" in text:
              crafting_time = text.split("Time:")[-1].strip()
          elif "Requires" in text:
              skill_req = text

      # Gather ingredient data
      ingredient_data = []
      ingredients_wrap = rd.find("div", class_="mastercrafted-ingredients")
      if ingredients_wrap:
          ingredient_divs = ingredients_wrap.find_all("div", class_="mastercrafted-ingredient")
          for ing_div in ingredient_divs:
              comp_div = ing_div.find("div", class_="mastercrafted-component")
              if comp_div:
                  tooltip = comp_div.get("data-tooltip", "")
                  style = comp_div.get("style", "")
                  qty_input = comp_div.find("input", {"type": "number"})
                  quantity = qty_input.get("value") if qty_input else "1"
                  ingredient_data.append({
                      "name": tooltip,
                      "quantity": int(quantity),
                      "background_image": style,
                  })

      # Gather result data
      result_data = []
      results_wrap = rd.find("div", class_="mastercrafted-results")
      if results_wrap:
          result_divs = results_wrap.find_all("div", class_="mastercrafted-result")
          for res_div in result_divs:
              comp_div = res_div.find("div", class_="mastercrafted-component")
              if comp_div:
                  tooltip = comp_div.get("data-tooltip", "")
                  style = comp_div.get("style", "")
                  qty_input = comp_div.find("input", {"type": "number"})
                  quantity = qty_input.get("value") if qty_input else "1"
                  result_data.append({
                      "name": tooltip,
                      "quantity": int(quantity),
                      "background_image": style,
                  })

      # Skip recipe if the recipe title is blacklisted (e.g. it's from the Raw Materials folder)
      # DEBUG: recipe filtering
      if title.strip().lower() in blacklist or any(res["name"].strip().lower() in blacklist for res in result_data):
          continue




      # Build a dict describing this recipe
      recipe_info = {
          "book_id": book_id,
          "recipe_id": recipe_id,
          "title": title,
          "required_tools": required_tools,
          "crafting_time": crafting_time,
          "skill_req": skill_req,
          "ingredients": ingredient_data,
          "results": result_data
      }

      # Exclude blacklisted
#      if recipe_info["title"] not in blacklist:
      
      recipes.append(recipe_info)

  return recipes, blacklist

def build_crafting_graph(recipes):
  print("Building recipe graph...")
  """
  Create an adjacency dictionary of item -> list_of_ingredients,
  but also store the required quantity of each ingredient.
  """
  graph = {}

  for r in recipes:
      for res in r["results"]:
          result_name = res["name"]

          # If we already stored a recipe for this item, skip additional ones
          if result_name in graph:
              continue

          # Store ingredients as tuples: (ingredient_name, required_quantity)
          # Get how many of this result item the recipe produces
          output_qty = res.get("quantity", 1)
          ing_list = [(ing["name"], ing["quantity"]) for ing in r["ingredients"]]
          graph[result_name] = {
              "produces": output_qty,
              "ingredients": ing_list
          }


  return graph

def build_expanded_graph(root_item, adj_dict, blacklist=None):
    if blacklist is None:
        blacklist = set()
    else:
        blacklist = set(blacklist)
    
    G = nx.DiGraph()
    counter = [0]

    def expand_item(item, parent_node=None, multiplier=1, path_stack=None):
        if path_stack is None:
            path_stack = []

        if item in path_stack:
            print(f"Cycle detected: {' -> '.join(path_stack + [item])}")
            return None

        # Only block blacklisted items if they are not craftable
        if item in blacklist and item not in adj_dict:
            return None


        counter[0] += 1
        usage_label = f"{item} #{counter[0]}"
        G.add_node(usage_label, item_name=item, quantity=multiplier)

        if parent_node:
            G.add_edge(parent_node, usage_label)

        # Don't expand blacklisted items
        if item in blacklist:
            return usage_label

        if item in adj_dict:
            new_path = path_stack + [item]
            produces = adj_dict[item].get("produces", 1)
            ingredients = adj_dict[item].get("ingredients", [])

            # Determine how many times to craft the recipe to get `multiplier` units of the item
            crafts_needed = math.ceil(multiplier / produces)

            for ing_name, quantity in ingredients:
                child_label = expand_item(ing_name, usage_label, crafts_needed * quantity, new_path)
                if child_label:
                    G.nodes[child_label]["quantity"] = crafts_needed * quantity

        return usage_label

    root_label = expand_item(root_item, multiplier=1)
    return G, root_label


def compute_node_depths(G, root):
  """
  Computes the depth of each node in the crafting tree based on the number
  of crafting steps from the root.
  """
  depths = {root: 0}
  queue = [(root, 0)]  # BFS

  while queue:
      node, depth = queue.pop(0)
      for neighbor in G.successors(node):
          if neighbor not in depths or depths[neighbor] > depth + 1:
              depths[neighbor] = depth + 1
              queue.append((neighbor, depth + 1))

  return depths

def _compute_base_materials(G, root, adj_dict):
  """
  Traverse the expanded graph (starting at 'root') and accumulate 
  total quantities for items that are NOT craftable (leaf nodes).
  Returns a dict of base_item_name -> total_quantity.
  """
  # BFS or DFS through the graph from the root node
  from collections import defaultdict
  
  base_materials = defaultdict(int)
  visited = set()
  stack = [root]

  while stack:
      node = stack.pop()
      if node in visited:
          continue
      visited.add(node)

      # Current node's data
      item_name = G.nodes[node].get("item_name", "")
      item_qty = G.nodes[node].get("quantity", 1)

      # If item_name is NOT in adj_dict, it's a base item (cannot be crafted further)
      # or if this node has no successors in the *expanded* graph, it's a leaf.
      if not list(G.successors(node)) and item_name not in adj_dict:
          base_materials[item_name] += item_qty
      else:
          # Not a leaf, continue traversing
          for child in G.successors(node):
              stack.append(child)

  return dict(base_materials)

def show_graph_in_pyvis(G, query_node, query_title, adj_dict):
    """
    Renders the given graph as an interactive PyVis network.
    Also computes total base materials and injects a floating popup 
    that displays their quantities.
    """
    output_html = query_title + " Graph.html"
    net = Network(height="1600px", width="100%", 
                    bgcolor=background_color, 
                    font_color=fonts_color, 
                    directed=True)

    # Compute node depths before rendering
    if query_node not in G.nodes:
        raise ValueError(f"Error: Query node '{query_node}' not found in the graph.")

    node_depths = compute_node_depths(G, query_node)

    # Convert NetworkX graph to PyVis
    net.from_nx(G)

    # Customize nodes
    for node in net.nodes:
        node_id = node["id"]
        nx_data = G.nodes[node_id]

        item_name = nx_data.get("item_name", str(node_id))
        quantity_needed = nx_data.get("quantity", 1)

        # Make a user-friendly label
        node["label"] = f"{item_name}\n{quantity_needed}x"
        node["color"] = node_color
        node["shape"] = "dot"
        node["title"] = f"{item_name}, Required: {quantity_needed}"

        # If this node is a "base material" node, or you want all nodes
        # to reflect a cost, store them in these custom properties:
        node["material_name"] = item_name  # or something more specific
        node["material_quantity"] = quantity_needed  # how many needed

        # Highlight the main query node
        if item_name == query_title:
            node["color"] = main_node_color
            node["size"] = 40
            node["shape"] = "circle"

        # Assign hierarchical level (for hierarchical layout)
        if node["id"] in node_depths:
            node["level"] = node_depths[node["id"]]

    # Customize edges
    for edge in net.edges:
        edge["width"] = 1.5
        edge["color"] = edge_color

    # Hierarchical layout settings
    net.set_options("""
    var options = {
        "layout": {
        "hierarchical": {
            "enabled": true,
            "direction": "UD",
            "nodeSpacing": 100,
            "treeSpacing": 75
          }
        },
        "physics": {
        "enabled": false
        }
    }
    """)

    # Write the initial PyVis HTML
    net.write_html(output_html, notebook=False)

    # --- Injection of Left-Click Script to Turn Nodes Green ---
    injection_script = """
<script type="text/javascript">
window.addEventListener("load", function () {
  setTimeout(function () {
      /***********************************************************
      * 0. Disable hierarchical layout (if previously used)
      *    Otherwise, it will constantly reposition nodes.
      ***********************************************************/
      network.setOptions({
      layout: {
          hierarchical: false
      }
      });

      const resetBtn = document.createElement("button");
      resetBtn.innerText = "Reset Positions";
      resetBtn.style = `
        position: absolute;
        top: 20px;
        left: 20px;
        z-index: 9999;
        padding: 10px;
        background-color: #444;
        color: #FBF5E5;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-family: Arial, sans-serif;
      `;
      resetBtn.onclick = () => {
        localStorage.removeItem("savedPositions");
        location.reload();
      };
      document.body.appendChild(resetBtn);


    // Restore saved node positions
    let savedPositions = JSON.parse(localStorage.getItem("savedPositions") || "{}");
    let updates = [];

    Object.entries(savedPositions).forEach(([id, pos]) => {
      if (network.body.data.nodes.get(id)) {
        updates.push({ id, x: pos.x, y: pos.y, fixed: { x: false, y: false } });
      }
    });

    network.body.data.nodes.update(updates);

    // Save new positions on dragEnd
    network.on("dragEnd", function (params) {
      if (!params.nodes.length) return;
      const positions = network.getPositions(params.nodes);
      const updateList = [];

      let saved = JSON.parse(localStorage.getItem("savedPositions") || "{}");
      params.nodes.forEach(id => {
        saved[id] = positions[id];
        updateList.push({ id, ...positions[id], fixed: { x: false, y: false } });
      });

      network.body.data.nodes.update(updateList);
      localStorage.setItem("savedPositions", JSON.stringify(saved));
    });

    // Setup green toggle on click
    var edges = network.body.data.edges.get();
    var adjacency = {};
    edges.forEach(edge => {
      if (!adjacency[edge.from]) adjacency[edge.from] = [];
      adjacency[edge.from].push(edge.to);
    });

    function propagateColor(sourceId, newColor) {
      var visited = {};
      var queue = [sourceId];
      var nodeUpdates = [];

      while (queue.length > 0) {
        var current = queue.shift();
        if (visited[current]) continue;
        visited[current] = true;

        var nodeData = network.body.data.nodes.get(current);
        if (!nodeData) continue;

        if (typeof nodeData.orig_color === 'undefined')
          nodeData.orig_color = nodeData.color;

        nodeUpdates.push({
          id: current,
          color: newColor,
        });

        if (adjacency[current])
          queue.push(...adjacency[current]);
      }

      network.body.data.nodes.update(nodeUpdates);
      updateEdges();
      updatePopup();
    }

    function updateEdges() {
      let allEdges = network.body.data.edges.get();
      let edgeUpdates = [];

      allEdges.forEach(edge => {
        if (typeof edge.orig_color === 'undefined')
          edge.orig_color = edge.color;

        let fromNode = network.body.data.nodes.get(edge.from);
        let toNode = network.body.data.nodes.get(edge.to);

        let newColor = (fromNode?.color === "green" || toNode?.color === "green") ? "green" : edge.orig_color;
        edgeUpdates.push({ id: edge.id, color: newColor });
      });

      network.body.data.edges.update(edgeUpdates);
    }

    function updatePopup() {
      let nodes = network.body.data.nodes.get();
      let edges = network.body.data.edges.get();
      let parents = new Set(edges.map(e => e.from));
      let materialCount = {};

      nodes.forEach(node => {
        if (node.material_name && node.material_quantity && !parents.has(node.id) && node.color !== "green") {
          materialCount[node.material_name] = (materialCount[node.material_name] || 0) + node.material_quantity;
        }
      });

      let html = '<h3 style="margin:0 0 10px 0;">Base Materials</h3>';
      Object.entries(materialCount).forEach(([k, v]) => {
        html += `<p style="margin:0;">${k}: ${v}</p>`;
      });

      let popup = document.getElementById("baseMaterialsPopup");
      if (popup) popup.innerHTML = html;
    }

    network.on("click", function (params) {
      var nodeId = network.getNodeAt(params.pointer.DOM);
      if (!nodeId) return;

      var node = network.body.data.nodes.get(nodeId);
      if (!node) return;

      node.orig_color ??= node.color;
      let newColor = node.color === "green" ? node.orig_color : "green";
      propagateColor(nodeId, newColor);

      let saved = JSON.parse(localStorage.getItem("greenNodes") || "[]");
      if (newColor === "green") {
        if (!saved.includes(nodeId)) saved.push(nodeId);
      } else {
        saved = saved.filter(id => id !== nodeId);
      }
      localStorage.setItem("greenNodes", JSON.stringify(saved));
    });

    // Reapply green nodes on load
    let savedGreen = JSON.parse(localStorage.getItem("greenNodes") || "[]");
    savedGreen = savedGreen.filter(id => network.body.data.nodes.get(id));
    localStorage.setItem("greenNodes", JSON.stringify(savedGreen));
    savedGreen.forEach(id => propagateColor(id, "green"));

    updateEdges();
    updatePopup();
  }, 1000);
});
</script>
"""

    # ----- Now we compute the base materials and inject a floating popup -----

    # 1. Compute base materials for the expanded graph
    base_materials = _compute_base_materials(G, query_node, adj_dict)
    # Example: {"Iron Ore": 10, "Wood": 5, ...}

    # 2. Build the HTML snippet
    popup_lines = [
        '<div id="baseMaterialsPopup" style="',
        '   position:absolute; top:20px; right:20px; ',
        '   background-color:#333333; color:#FBF5E5; ',
        '   padding:15px; border-radius:8px; z-index:9999;',
        '   font-family: Arial, sans-serif; ',
        '   opacity: 0.9; ',
        '">',
        f'   <h3 style="margin:0 0 10px 0;">Base Materials</h3>'
    ]
    for mat_name, qty in base_materials.items():
        popup_lines.append(f'   <p style="margin:0;">{mat_name}: {qty}</p>')
    popup_lines.append('</div>')

    popup_html = "\n".join(popup_lines)
    
    # Combine the left-click script and the popup HTML
    injection_combined = injection_script + "\n" + popup_html

    # --- Inject the Combined Snippet into the Generated HTML ---
    with open(output_html, "r", encoding="utf-8") as f:
        html_content = f.read()

    injection_point = html_content.rfind("</body>")
    if injection_point == -1:
        new_html_content = html_content + injection_combined
    else:
        new_html_content = html_content[:injection_point] + injection_combined + "\n" + html_content[injection_point:]

    with open(output_html, "w", encoding="utf-8") as f:
        f.write(new_html_content)

    print(f"Graph saved as {output_html}.")

def fetch_recipe_page_with_selenium(recipe_page_url):
  options = webdriver.ChromeOptions()
  # Uncomment the next line to run in headless mode if desired:
  # options.add_argument("--headless")
  driver = webdriver.Chrome(options=options)
  driver.get(recipe_page_url)
  
  # --- LOGIN STEP -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  # Wait until the login form is present.
  WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "join-game-form")))
  
  # Locate the user dropdown and re-enable the "Caine" option.
  select_element = driver.find_element(By.NAME, "userid")
  caine_option = select_element.find_element(By.XPATH, ".//option[text()='Caine']")
  driver.execute_script("arguments[0].disabled = false;", caine_option)
  
  # Select "Caine" from the dropdown.
  select = Select(select_element)
  select.select_by_visible_text("Caine")
  
  # Click the "Join Game Session" button.
  join_button = driver.find_element(By.XPATH, "//button[@name='join']")
  join_button.click()
  
  # Wait until the game interface loads (e.g., the URL contains "game").
  WebDriverWait(driver, 10).until(lambda d: "game" in d.current_url)
  
  # --- ACTIVATE THE "ITEMS" TAB -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  try:
      # Wait for the body to have the expected classes.
      WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH,"//body[contains(@class, 'vtt') and contains(@class, 'game') and contains(@class, 'system-worldbuilding') and contains(@class, 'theme-dark')]")))
      print("Game interface loaded.")
      
      # Locate the section with id="ui-right" inside the interface.
      ui_right_section = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.XPATH,"//div[@id='interface']//section[@id='ui-right']")))
      print("UI-right section loaded.")
      
      # Within ui-right, locate the sidebar with id="sidebar" and class "app".
      sidebar_app = WebDriverWait(ui_right_section, 15).until(EC.presence_of_element_located((By.XPATH,".//div[@id='sidebar' and contains(@class, 'app')]")))
      print("Sidebar (app) loaded.")
      
      # Within the sidebar, locate the "Items" tab (<a> element with data-tab="items").
      items_tab = WebDriverWait(sidebar_app, 15).until(EC.element_to_be_clickable((By.XPATH, "//nav[@id='sidebar-tabs']//a[@data-tab='items']")))
      try:
          items_tab.click()
      except Exception:
          driver.execute_script("arguments[0].click();", items_tab)
          print("Items tab activated via JavaScript.")
  except Exception as e:
      print("Failed to activate the Items tab:", e)
  
  # --- CLICK THE RECIPE MANAGER BUTTON ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  try:
      # Wait for the Recipe Manager button (identified by its CSS class) to become clickable.
      recipe_manager_button = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.mastercrafted-open-recipe-app")))
      try:
          recipe_manager_button.click()
      except Exception:
          driver.execute_script("arguments[0].click();", recipe_manager_button)
          print("Recipe manager button clicked via JavaScript.")
  except Exception as e:
      print("Recipe manager button not found or not clickable:", e)
  
  # --- WAIT FOR THE RECIPE MANAGER CONTENT TO LOAD ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  try:
        # Wait for an element that indicates the recipe manager has loaded.
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "mastercrafted-recipeApp")))
        print("Recipe manager content loaded.")
  except Exception as e:
        print("Could not locate the recipe manager content element:", e)
  
  # --- FINISH ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  html = driver.page_source
  driver.quit()
  return html

if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    local_file_path = script_dir / "reciperaw.html"
    recipe_page_url = "http://173.16.234.161:30000/game"
    
    update = 'FALSE'

    if update == 'TRUE':
        try:
            html_content = fetch_recipe_page_with_selenium(recipe_page_url)
            with open(local_file_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            print("Successfully logged in via Selenium and fetched the recipe page.")
        except Exception as e:
            print("Selenium login failed, falling back to local file. Error:", e)
            with open(local_file_path, "r", encoding="utf-8") as f:
                html_content = f.read()
    else:
        print("Update skipped...")
        with open(local_file_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        
    # Continue with your parsing and graph-building logic.
    parsed_recipes, blacklist = parse_mastercrafted_recipes(html_content)

    adj_dict = build_crafting_graph(parsed_recipes)

def search_and_open():
  """Get the item name from the user, build the graph, and open the HTML file."""
  query_item = entry.get().strip()
  if not query_item:
      return  # Do nothing if empty input
  
  # Do a case-insensitive search for a matching key in the adjacency dictionary.
  matched_item = None
  for key in adj_dict.keys():
      if key.lower() == query_item.lower():
          matched_item = key
          break

  if matched_item is None:
      print(f"No recipe found for '{query_item}' (case-insensitive match).")
      return
  
  try:
      # Build the expanded graph for the item
      G_expanded, query_node = build_expanded_graph(matched_item, adj_dict, blacklist)
      # Generate and save the PyVis HTML graph
      show_graph_in_pyvis(G_expanded, query_node, matched_item, adj_dict)
      # The output file is named "<matched_item> Graph.html"
      output_file = matched_item + " Graph.html"
      # Open the generated HTML file in the default web browser
      webbrowser.open("file:///" + os.path.abspath(output_file))
  except Exception as e:
      print("Error building or opening graph for item:", e)


print("Opening GUI...")

# Set up the Tkinter GUI
root = tk.Tk()
root.title("Item Recipe Search")

# Create a frame for some padding
frame = ttk.Frame(root, padding="10 10 10 10")
frame.grid(column=0, row=0, sticky=(tk.N, tk.W, tk.E, tk.S))

# Label and Entry for the item name
ttk.Label(frame, text="Enter the name of the item:").grid(column=0, row=0, padx=5, pady=5)
entry = ttk.Entry(frame, width=40)
entry.grid(column=1, row=0, padx=5, pady=5)

# Button to trigger the search and open the graph
search_button = ttk.Button(frame, text="Search", command=search_and_open)
search_button.grid(column=0, row=1, columnspan=2, padx=5, pady=10)

# Configure grid padding for all children
for child in frame.winfo_children():
    child.grid_configure(padx=5, pady=5)

# Start the Tkinter event loop
print("Done!")
root.mainloop()