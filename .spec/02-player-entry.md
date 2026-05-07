# Basic MUD entry point

Currently, our frontend is not very bright.  It's got a front page that displays basic information and a game engine that handles the websocket information and user input.

**Goal**: Produce a "real" front door for the user.

In this task, we'll provide a "proper" home page.  This will have a banner (which shows the game version in the top left - we'll include a logo later on - and the user profile in the top right).  Below that will be a stretched image (use `images/homepage.jpg` as source).  At the bottom of the viewport will be a copyright message (black background, white text, centered) with the copyright from the package.json copyright property.

In the middle of the page will be an "Enter the game" button.  The main hues of the homepage.jpg are brown, so a bright yellow button with rounded corners would be suitable.  This button opens a modal which allows the user to select a character.  If at least one character has been created, then the user can click on the character and the `+ Create a new character` button appears at the bottom of the modal.  The user can create up to 8 characters, and the characters are ordered by the most recently used character.  If no characters are available (new user), then the modal for creating a new character (see below) appears automatically.  If 8 characters have already been created, the `+ Create a new character` button is disabled.

Each character is stored in the MAP in the "playerCharacters" table, with columns "userEmail", "name", "gender", and "lastUsed".

When the user clicks on `+ Create a new character`, a new modal is opened to create a character.  The only two questions are "What is the characters name?" and "What is the characters gender?".  The characters name is case insensitive, one word, starting with a letter and having between 5 and 32 characters.  Non-ASCII characters (e.g. Kanji) are disallowed.  The format is `^[a-z][a-z0-9]{4,31}$` in regular expressions.  In addition, no duplicate character names are allowed.  Use an API to detect if the character name is allowed.  Gender can be "Male", "Female", or "Neutral" and only affects in-game messaging (e.g. "Dorian wields her battleaxe").  The create button is disabled until a valid character name is created and a gender is selected.

When the user creates the character (by clicking on the active Create button), the character is created via the API and the user is placed in the game, which is currently handled by "GameDisplay.tsx".  The game display also needs to be adjusted, to have a banner and then the chat results and chat input areas as today.  The banner is the same banner as the home page, with the addition of the character name in the top right corner next to or below the profile information, and an "Exit Game" button. We will be adding items (such as help) that are not available on the home page to the banner in the future.

Note that a player (signified by the user email authentication) can still only be playing one character.

We are going to be working extensively on the game UI, so we should consider component heirarchy and capabilities carefully to avoid major refactors later on.

**Acceptance Criteria**:

At the end of this task, and when deployed:

- I can sign on to the home page and see the page as described.
- I can click on the "Enter the game" button and see the "Create a character" modal
- Fill in the create a character form - I can enter the game and the playerCharacters table is populated.
- Exit the game.
- CLick on "Enter the game" button - I see my character and option to create a character.
- Create 7 more new characters the same way - the create a character button should be disabled.
- Selecting a character should enter the game
- Header should be as advertised
