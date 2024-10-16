# ChainCraft Game DSL: Decentralized Game Definitions with Web3 Integration
This repo contains the schemas, examples, and validator for ChainCraft Game Definitions.

ChainCraft Game Definitions provide a domain-specific language (DSL) for games, from which we can generate code for playable games. The intent is that the creation of a game definition is a collaborative process between ChainCraft AI agents and human creators. By giving the AI a target DSL, we can reduce or eliminate quality issues that occur when asking an AI to generate all the code for a game. Additionally, this allows the AI to create platform-independent definitions, which can be translated into platform-specific code on any platform. This approach forms a key part of the open architecture of ChainCraft, intentionally avoiding the creation of walled gardens common in many low-code and no-code game creation platforms.

ChainCraft's integration with Web3 technology allows for decentralized ownership and distribution of game assets and definitions. By leveraging smart contracts and NFTs, creators and contributors can maintain provenance and rights over their work, ensuring a more equitable and transparent ecosystem. This Web3-native approach also enables seamless integration with blockchain elements like on-chain game assets, making it possible to build interoperable and community-driven game experiences.

The ChainCraft Game Definition is designed to evolve over time to broaden the types of games that can be generated with ChainCraft. Initially, ChainCraft is focused on card games, and later it will expand to incorporate tabletop games and eventually video games.


## Structure

The repository is structured as follows:

- `examples/`: Contains examples of game definitions, such as `allegra`, `gwent`, `spades`, and `spice_road`.
- `registries/`: Contains YAML files that define actions and components used in the game definitions.
- `schemas/`: Contains JSON schema files that validate the structure of the game definitions, actions, and components.

## Game Definitions

Each game definition is a YAML file that includes the following sections:

- `includes`: References to other YAML files that are included in the game definition.
- `functions`: Defines functions used in the game definition.  
- `roles`: Defines the roles that players can have in the game.
- `rounds`: Defines the rounds that occur in the game.
- `flow`: Defines the stages of gameplay and repeatable sequences within gameplay
- `game`: Defines the components of the game.

### Entity-Component-System (ECS) in Game Definitions
ChainCraft game definitions utilize the Entity-Component-System (ECS) pattern. In this architectural pattern, every object in the game (an "Entity") is composed of one or more components, and systems provide the logic that manipulates these components. In the context of our game definitions, entities are represented by the game, assets within the game such as game pieces and decks, player roles (like `player` or `team`) and the flow of the game, components add functionallity to the game, and systems are represented by core systems that manage game flow based on components and mechanics. This pattern allows for flexible and modular game design, making it easy to add, remove, or modify game elements without affecting other parts of the game definition.  This is critical to the goal of a gamedef that can represent the widest possible range of games and game genres.

### Functions
Functions are Lua functions that can be referenced in the game definition to describe game-specific logic, e.g. how scoring is calculated.  Why Lua?  We wanted to have an expressive language that could be leveraged in all possible generation targets.  Lua has interpreters in JavaScript, C#, C++, Swift, Objective-C, and Python so every conceivable generation target for games is covered.  Lua can be interepreted directly by the generated code or can be transformed into code in the generation target language.  Functions can be defined in an external file under a `functions` key.  The validator and the generators will merge locally and externally defined functions as a preprocessing step.

### Roles
Roles are used to defined the rounds players particpate in and the actions they may take during a game.  Roles may be static for the duration of the game, or they may change between rounds (e.g. a player may become the dealer).  Components may be attached to roles in order to grant properties, and inventories to a role.

### Rounds
Rounds are used in turn based games to define a sequence of gameplay that will occur for each player with a particular role.  In its most basic form a round would include each player taking a turn.  Components may be attached to rounds to define actions that may be taken during a round and how a round is scored.

### Flow
The flow defines how the game progresses over time, ie. what are the major steps in gameplay, what sequneces of steps are repeated and what is the exit criteria for a repeating sequence of steps.

### Game
The game can have components that grant properties, inventories, assets (such as decks, boards, game pieces) teaming, and mechanics to a game.

### Mechanics
Mechanics are elements of gameplay that are game independent and are resusable across games.  For example, the idea of having a trump card, exists in games spades, hearts and euchre, and could be applicable to deck builders as well.  ChainCraft has a set of core mechanics Mechanics have a lua script. They also have a schema that defines which the interface to the mechanic (what it's inputs are). Mechanic scripts will never be specified in the yaml for a specific game as they are game independent, however the mechanic properties will be specific to the game's usage of the mechanic.  Eventually, there will be a mechanics registry where creators can register mechnics that can be incorporated in games.  This will provide utility for nvel gameplay concepts even if the game they were originally introduced in is never made.   

### Components 
These are passive attributes that define the state and properties of an entity. They affect gameplay broadly and are always "active" as long as they are attached to an entity. They may not have a direct graphical representation, but they define the underlying data and rules of the game.  Components may be standard components of may be introduced as part of a mechanic.

Components are defined in the `components.yaml` file in the `registries` directory. Each component has a corresponding JSON schema file in the `schemas` directory.  


### Actions
These are active behaviors that require input or decision from the user (or AI for non-player entities). They have a direct impact on the game state and often have a graphical representation (like an animation). They can be enabled or disabled, providing a dynamic aspect to the gameplay.  Actions may be standard actions or may be introduced as part of a mechanic.

Actions are defined in the `actions.yaml` file in the `registries` directory. Each action has a corresponding JSON schema file in the `schemas` directory.


## Actions


## Contributing
Contributions are welcome! Please read the contributing guidelines before making any changes.
