for (const actor of game.actors.contents) {
    if (actor?.name === "Caine Astrin") {
        console.log(actor.system.attributes.stats.mind.value);

        let roll = new Roll("1d20 + " + actor.system.attributes.stats.mind.value);
        roll.roll({async: true}).then(result => {
            ChatMessage.create({  
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({actor: actor}),
                content: `Rolled: ${result.total} (Formula: ${result.formula})`
            });
        });
    }
}
