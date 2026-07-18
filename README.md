# MTG Board

A local-first Magic: The Gathering Commander board built with React, TypeScript, Vite, and Zustand.

## Development

```sh
npm install
npm run dev
```

The app opens at the local Vite URL. It imports the bundled Blight Curse deck on a fresh install when Scryfall is reachable.

## Checks

```sh
npm run build
npm run lint
npm audit --omit=dev
```

## Features

- Commander deck imports from the bundled prebuilt list via Scryfall
- Persistent imported decks and board state in browser local storage
- Battlefield, hand, command zone, graveyard, exile, counters, tap/untap, and life tracking
- Dice and coin tools
- Custom board background and draggable camera preview
- Browser screen capture with a visible broadcast indicator

No card data or camera stream is sent to an application server. Scryfall is contacted for card imports and images.

## SpellTable workflow

SpellTable expects a video input device. Click **Open Public View**; the app opens a fixed-size public window with the hand omitted. Add that window to OBS Studio as a Window Capture source, start **OBS Virtual Camera**, and select OBS Virtual Camera as SpellTable’s video input. OBS is only acting as the camera bridge; it no longer needs to crop the board.

The browser button controls the public-output window and shows when it is active; it does not create a system webcam by itself.
