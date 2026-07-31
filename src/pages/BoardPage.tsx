import CardZoom from '../components/Board/CardZoom'
import CameraWidget from '../components/Board/CameraWidget'
import DiceCoinOverlay from '../components/Board/DiceCoinOverlay'
import GraveyardOverlay from '../components/Board/GraveyardOverlay'
import { CastSpellStack } from '../components/Board/CastSpellStack'
import { TriggerStack } from '../components/Board/TriggerStack'
import { CardContextMenu } from '../components/Board/CardContextMenu'
import { BoardControls } from '../components/Board/BoardControls'
import { BoardZonesPanel } from '../components/Board/BoardZonesPanel'
import { useBoardInteractions } from './useBoardInteractions'
import { BoardTurnPrompt } from './BoardTurnPrompt'
import { BoardOpponentZone } from './BoardOpponentZone'
import { BoardBattlefield } from './BoardBattlefield'
import { BoardHand } from './BoardHand'

export default function BoardPage() {
  const {
    cards, broadcasting, backgroundImage,
    drawNotice, turnAnnouncement, turnPrompt,
    cancelTurnPrompt, overrideLandPlay, resolveConditionalEntry,
    discardForTurn, setOverlay, toggleTap, moveCard,
    reorderBattlefield,
    showOpponent, opponentLifeTotal, activePlayer,
    handCards, handStacks, creatureCards, planeswalkerCards,
    battleCards, spellCards, artifactCards, enchantmentCards,
    landCards, landStacks, otherPermanents,
    graveyardCards, commandCards, libraryCards, exileCards,
    opponentViewModel,
    contextMenu, setContextMenu,
    handExpanded, setHandExpanded,
    manaLogOpen, setManaLogOpen,
    manaUsageKind, setManaUsageKind,
    manaUsageLabel, setManaUsageLabel,
    backgroundOnly, setBackgroundOnly,
    cardLayout, dragCardId,
    handleRightClick, handleDeckChange,
    onDragOver, onDropOnBattlefield,
  } = useBoardInteractions()

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        color: '#fff',
        minHeight: 0,
        marginLeft: 0,
      }}
    >
      <style>{`
        @keyframes turnPulse {
          0%, 100% { box-shadow: inset 0 0 0 1px rgba(88,166,255,0); }
          50% { box-shadow: inset 0 0 0 1px rgba(88,166,255,0.35); }
        }
      `}</style>

      {broadcasting && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 30,
            padding: '5px 9px',
            borderRadius: 999,
            background: 'rgba(248,81,73,0.9)',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.3px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          ● BROADCASTING
        </div>
      )}

      {(drawNotice || turnAnnouncement) && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            maxWidth: 'calc(100% - 32px)',
            pointerEvents: 'none',
          }}
        >
          {drawNotice && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div
                role="status"
                style={{
                  padding: '18px 32px',
                  borderRadius: 999,
                  background: 'rgba(13,17,23,0.94)',
                  border: '2px solid rgba(255,211,61,0.7)',
                  color: '#ffd33d',
                  fontSize: '2.25rem',
                  fontWeight: 900,
                  letterSpacing: '1.5px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                }}
              >
                ✦ {drawNotice.count === 1 ? '1 CARD DRAWN' : `${drawNotice.count} CARDS DRAWN`}
              </div>
              {drawNotice.cardNames && drawNotice.cardNames.length > 0 && (
                <div
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    background: 'rgba(13,17,23,0.92)',
                    border: '1px solid rgba(255,211,61,0.3)',
                    color: '#e6edf3',
                    fontSize: '1rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    lineHeight: 1.5,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                  }}
                >
                  {drawNotice.cardNames.join(', ')}
                </div>
              )}
            </div>
          )}
          {turnAnnouncement && (
            <div
              role="status"
              style={{
                padding: '18px 32px',
                borderRadius: 999,
                background: 'rgba(13,17,23,0.94)',
                border: '2px solid rgba(88,166,255,0.7)',
                color: '#79c0ff',
                fontSize: '2.25rem',
                fontWeight: 900,
                letterSpacing: '1.5px',
                whiteSpace: 'nowrap',
                boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
              }}
            >
              {turnAnnouncement.text}
            </div>
          )}
        </div>
      )}

      {turnPrompt && (
        <BoardTurnPrompt
          turnPrompt={turnPrompt}
          handCards={handCards}
          cards={cards}
          cancelTurnPrompt={cancelTurnPrompt}
          resolveConditionalEntry={resolveConditionalEntry}
          overrideLandPlay={overrideLandPlay}
          discardForTurn={discardForTurn}
        />
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
          position: 'relative',
          overflow: 'auto',
          background: '#10151d',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: cardLayout.zonePanelHeight + cardLayout.boardCard.height + 24,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {showOpponent && (
            <BoardOpponentZone
              opponentViewModel={opponentViewModel}
              opponentLifeTotal={opponentLifeTotal}
              activePlayer={activePlayer}
              setOverlay={setOverlay}
              handleRightClick={handleRightClick}
              cardWidth={cardLayout.boardCard.width}
              cardHeight={cardLayout.boardCard.height}
            />
          )}

          <BoardControls
            handleDeckChange={handleDeckChange}
            manaLogOpen={manaLogOpen}
            setManaLogOpen={setManaLogOpen}
            manaUsageKind={manaUsageKind}
            setManaUsageKind={setManaUsageKind}
            manaUsageLabel={manaUsageLabel}
            setManaUsageLabel={setManaUsageLabel}
            onBackgroundOnly={() => setBackgroundOnly(true)}
          />

          <div
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: backgroundImage
                ? `url(${backgroundImage}) center/cover no-repeat`
                : 'url(/unofficial_magic_the_gathering.webp) center/cover no-repeat',
            }}
          >
            <CameraWidget />
            <CastSpellStack
              cards={spellCards}
              baseWidth={cardLayout.boardCard.width}
              baseHeight={cardLayout.boardCard.height}
              rightOffset={Math.round(cardLayout.zonePanelWidth * 0.46)}
              bottomOffset={cardLayout.zonePanelHeight + 14}
              onClick={(cardId) => setOverlay({ type: 'zoom', cardId })}
              onContextMenu={handleRightClick}
            />

            <BoardBattlefield
              creatureCards={creatureCards}
              artifactCards={artifactCards}
              planeswalkerCards={planeswalkerCards}
              battleCards={battleCards}
              enchantmentCards={enchantmentCards}
              otherPermanents={otherPermanents}
              landCards={landCards}
              landStacks={landStacks}
              toggleTap={toggleTap}
              handleRightClick={handleRightClick}
              setOverlay={setOverlay}
              reorderBattlefield={reorderBattlefield}
              onDragOver={onDragOver}
              onDropOnBattlefield={onDropOnBattlefield}
              cardLayout={cardLayout}
            />

            <BoardZonesPanel
              commandCards={commandCards}
              libraryCards={libraryCards}
              graveyardCards={graveyardCards}
              exileCards={exileCards}
              handCount={handCards.length}
              cardLayout={cardLayout}
              moveCard={moveCard}
              handleRightClick={handleRightClick}
              setOverlay={setOverlay}
            />
          </div>
        </div>
      </div>

      <BoardHand
        handCards={handCards}
        handStacks={handStacks}
        handExpanded={handExpanded}
        setHandExpanded={setHandExpanded}
        dragCardId={dragCardId}
        setOverlay={setOverlay}
        handleRightClick={handleRightClick}
        cardLayout={cardLayout}
      />

      <CardZoom />
      <TriggerStack />
      <DiceCoinOverlay />
      <GraveyardOverlay />

      {contextMenu && (
        <CardContextMenu
          cardId={contextMenu.cardId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {backgroundOnly && (
        <div
          role="dialog"
          aria-label="Background-only view"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1200,
            background: backgroundImage
              ? `url(${backgroundImage}) center/cover no-repeat`
              : 'url(/unofficial_magic_the_gathering.webp) center/cover no-repeat',
            backgroundColor: '#39231e',
          }}
        >
          <button
            type="button"
            onClick={() => setBackgroundOnly(false)}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              padding: '7px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(13,17,23,0.82)',
              color: '#e6edf3',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 700,
              boxShadow: '0 3px 12px rgba(0,0,0,0.4)',
            }}
          >
            Show Board
          </button>
        </div>
      )}
    </div>
  )
}
