# Bluetooth protocol

The board advertises as `SmartDice` with one custom service.

| Item                 | UUID                                   |
|----------------------|----------------------------------------|
| Service              | `f0bd0001-2ae7-429a-8fe0-3aa48ebf8220` |
| State characteristic | `f0bd0002-2ae7-429a-8fe0-3aa48ebf8220` |

The state characteristic supports read and notify. The board sends a
notification about 20 times a second.

## State packet (9 bytes, little-endian)

| Offset | Type   | Field  | Meaning                                         |
|--------|--------|--------|-------------------------------------------------|
| 0      | int16  | ax     | X acceleration in milli-g                       |
| 2      | int16  | ay     | Y acceleration in milli-g                       |
| 4      | int16  | az     | Z acceleration in milli-g                       |
| 6      | uint8  | face   | Upper face, 1 to 6. 0 means no clear face.      |
| 7      | uint8  | stable | 1 once the face has held still for 300 ms.      |
| 8      | uint8  | sleepIn | Seconds until the board goes to sleep, 0 to 254. 255 means auto sleep is off. |

Older firmware sends only the first 8 bytes. The dashboard accepts both and treats a
missing `sleepIn` like 255.

When `sleepIn` reaches 0 the board sends one last packet and then disconnects. It stops
advertising until the die is moved, so it will not appear in the Bluetooth popup while it
sleeps.

These values are defined in two places that must stay in step:
`firmware/smart_dice/smart_dice.ino` and `web/src/dice/protocol.js`.
