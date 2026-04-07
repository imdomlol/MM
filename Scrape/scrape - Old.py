from pathlib import Path

from bs4 import BeautifulSoup
import networkx as nx
from pyvis.network import Network

background_color = "#212121"
fonts_color = "#FBF5E5"
main_node_color = "#A35C7A"
node_color = "#C890A7"
edge_color = "#C890A7"

def parse_mastercrafted_recipes(html_text):
    """
    Parse the HTML for 'mastercrafted-recipe' items using BeautifulSoup.
    Return a list of recipe dicts, each with metadata and ingredients/results.
    """
    soup = BeautifulSoup(html_text, "html.parser")



    recipe_blacklist = soup.find("li", class_="directory-item level1 recipe-book", attrs={"data-book-id": "FhKkLMJiXCMia3CT"})
    blacklist = []

    if recipe_blacklist:
        recipe_ol = recipe_blacklist.find("ol", class_="headings recipe-list")
        if recipe_ol:
            rli = recipe_ol.find_all("li", class_="directory-item level2 recipe")
            if not rli:
                print("Unable to find rli on line 19")
            else:
                for li in rli:
                    recipe_name_tag = li.find("span", class_="page-title")
                    recipe_name = recipe_name_tag.get_text(strip=True) if recipe_name_tag else ""

                    blacklist.append(recipe_name)




    recipe_divs = soup.find_all("div", class_="mastercrafted-recipe hidden")
    recipes = []

    for rd in recipe_divs:
        book_id = rd.get("data-book-id", "")
        recipe_id = rd.get("data-recipe-id", "")
        header = rd.find("header", class_="mastercrafted-recipe-header")
        if not header:
            continue

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

        # Gather ingredient data from the "mastercrafted-ingredients" section
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

        # Gather result data from the "mastercrafted-results" section
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

        if recipe_info["title"] not in blacklist:
            recipes.append(recipe_info)

    return recipes

def build_crafting_graph(recipes):
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
            ing_list = [(ing["name"], ing["quantity"]) for ing in r["ingredients"]]
            graph[result_name] = ing_list

    return graph

def build_expanded_graph(root_item, adj_dict):
    G = nx.DiGraph()
    counter = [0]

    def expand_item(item, parent_node=None, multiplier=1):
        counter[0] += 1
        usage_label = f"{item} #{counter[0]}"  # Ensure unique node names
        G.add_node(usage_label, item_name=item, quantity=multiplier)  # Track cumulative quantity

        if parent_node is not None:
            G.add_edge(parent_node, usage_label)

        if item in adj_dict:
            for ing_name, quantity in adj_dict[item]:  # Get required quantity
                new_multiplier = multiplier * quantity  # Multiply by parent requirement
                child_label = expand_item(ing_name, usage_label, new_multiplier)
                G.nodes[child_label]["quantity"] = new_multiplier  # Store new quantity

        return usage_label  # Return the generated node name

    root_label = expand_item(root_item, multiplier=1)  # Root starts with x1 multiplier
    return G, root_label

def compute_node_depths(G, root):
    """
    Computes the depth of each node in the crafting tree based on the number
    of crafting steps needed to reach it.
    """
    depths = {root: 0}  # Root (starting item) is at level 0
    queue = [(root, 0)]  # BFS traversal

    while queue:
        node, depth = queue.pop(0)
        for neighbor in G.successors(node):  # Outgoing edges
            if neighbor not in depths or depths[neighbor] > depth + 1:
                depths[neighbor] = depth + 1
                queue.append((neighbor, depth + 1))

    return depths

def show_graph_in_pyvis(G, query, query_title):
    output_html = query + " Graph.html"
    net = Network(height="1600px", width="100%", bgcolor=background_color, font_color=fonts_color, directed=True)

    # Compute node depths before rendering
    if query not in G.nodes:
        raise ValueError(f"Error: Query node '{query}' not found in the graph.")

    node_depths = compute_node_depths(G, query)

    # Load NetworkX graph into PyVis
    net.from_nx(G)

    # Node customization
    for node in net.nodes:
        original_label = G.nodes[node["id"]].get("item_name", node["id"])
        quantity_needed = G.nodes[node["id"]].get("quantity", 1)

        # Format label properly
        node["label"] = f"{original_label}\n{quantity_needed}x"
        node["color"] = node_color
        node["shape"] = "dot"
        node["title"] = f"{original_label}, Required: {quantity_needed}"

        if original_label == query_title:
            node["color"] = main_node_color
            node["size"] = 40
            node["shape"] = "circle"

        # Assign hierarchical levels manually
        if node["id"] in node_depths:
            node["level"] = node_depths[node["id"]]  # Assign depth-based level

    # Edge customization
    for edge in net.edges:
        edge["width"] = 1.5
        edge["color"] = edge_color

    # Save as HTML file
    net.write_html(output_html, notebook=False)
    print(f"Graph saved as {output_html}")

if __name__ == "__main__":
    with open(Path(__file__).resolve().parent / "reciperaw.html", "r", encoding="utf-8") as f:
        html_content = f.read()

    parsed_recipes = parse_mastercrafted_recipes(html_content)
    adj_dict = build_crafting_graph(parsed_recipes)

    # Suppose you want to expand "Crown of Dominance"
    query = "Crown of Dominance"

    # Get the expanded graph and the correct query node name
    G_expanded, query_node = build_expanded_graph(query, adj_dict)

    # 🔹 Ensure we're passing the correct query node
    show_graph_in_pyvis(G_expanded, query_node, query)






#display total # of mats in top left
#display total crafting time required in top left

#display individual mat requirement on circles in chart