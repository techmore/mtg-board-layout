import type { CardScale } from '../types/card'

/** User-facing scale presets. Keep these in one place so controls and layout agree. */
export const CARD_SCALE_OPTIONS: readonly CardScale[] = [1, 1.25, 1.5, 1.75, 2]

const BASE_CARD_WIDTH = 180
const BASE_CARD_HEIGHT = 252
const ZONE_BOX_PADDING = 12
const ZONE_PANEL_GAP = 4
const ZONE_COUNT = 4

function scaled(value: number, scale: CardScale) {
  return Math.round(value * scale)
}

/**
 * Shared board geometry. Battlefield cards, lands, and the four bottom zones
 * intentionally use the same card size; the private hand remains larger.
 */
export function getCardLayout(scale: CardScale, handBig: boolean, maxHandStackCount = 1) {
  const boardCard = {
    width: scaled(BASE_CARD_WIDTH, scale),
    height: scaled(BASE_CARD_HEIGHT, scale),
    // Intentional dense stacking: enough of each duplicate remains visible.
    stackOffset: scaled(26, scale),
  }
  const zoneBoxWidth = boardCard.width + ZONE_BOX_PADDING
  const zonePanelWidth = zoneBoxWidth * ZONE_COUNT + ZONE_PANEL_GAP * (ZONE_COUNT - 1)
  // The Library column also contains the one-line private-hand indicator.
  const zonePanelHeight = boardCard.height + 72
  const handCardHeight = scaled(handBig ? 390 : 138, scale)
  const handStackOffset = scaled(handBig ? 26 : 18, scale)

  return {
    boardCard,
    zoneBoxWidth,
    zonePanelWidth,
    zonePanelHeight,
    // The panel is right: 8px, plus an 8px visual gap before land stacks.
    landRowClearance: zonePanelWidth + 16,
    handCardHeight,
    handStackOffset,
    handGap: scaled(handBig ? 24 : 10, scale),
    handHeight: Math.max(
      scaled(handBig ? 440 : 175, scale),
      handCardHeight + (Math.max(1, maxHandStackCount) - 1) * handStackOffset + scaled(handBig ? 44 : 36, scale),
    ),
  }
}
