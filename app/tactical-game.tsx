'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Layers3,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  X,
} from 'lucide-react'

type PlayerId = 0 | 1
type Shape = 'circle' | 'star' | 'diamond'
type Ports = { north: Shape | null; east: Shape | null; south: Shape | null; west: Shape | null }
type Card = {
  id: string
  name: string
  family: string
  basePower: number
  ports: Ports
  owner: PlayerId
  accent: 'coral' | 'teal' | 'gold' | 'violet'
}
type PlayerState = {
  hand: Card[]
  deck: Card[]
  frontline: (Card | null)[]
  deployment: (Card | null)[]
  shields: (Card | null)[]
  discard: Card[]
}
type GameState = {
  players: [PlayerState, PlayerState]
  active: PlayerId
  turn: number
  summonsThisTurn: number
  attacked: string[]
  winner: PlayerId | null
  log: string[]
}
type PendingDeployment = { cardId: string; lane: number } | null

const shapeMeta: Record<Shape, { label: string; bonus: number }> = {
  circle: { label: '円', bonus: 10 },
  star: { label: '星', bonus: 50 },
  diamond: { label: '菱', bonus: 25 },
}
const shapeSequence: Shape[] = ['circle', 'star', 'diamond', 'circle', 'diamond', 'star']
const cardNames = ['ルミナ', 'スパーク', 'ノヴァ', 'オービット', 'シグナル', 'ミラージュ', 'アストラ', 'コメット', 'エコー', 'プリズム']
const accents: Card['accent'][] = ['coral', 'teal', 'gold', 'violet']

function shuffled<T>(items: T[], seed: number) {
  const result = [...items]
  let state = seed >>> 0
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function makeDeck(owner: PlayerId): Card[] {
  return Array.from({ length: 20 }, (_, index) => {
    const shift = (index + owner * 2) % shapeSequence.length
    const north = shapeSequence[shift]
    const south = shapeSequence[(shift + 1 + (index % 3 === 0 ? 1 : 0)) % shapeSequence.length]
    const east = index % 4 === 0 ? shapeSequence[(shift + 2) % shapeSequence.length] : null
    const west = index % 5 === 0 ? shapeSequence[(shift + 3) % shapeSequence.length] : null
    return {
      id: `p${owner + 1}-${String(index + 1).padStart(2, '0')}`,
      name: cardNames[(index + owner * 3) % cardNames.length],
      family: ['航行体', '共鳴体', '機巧体', '光子体'][index % 4],
      basePower: 30 + ((index * 13 + owner * 7) % 5) * 10,
      ports: { north, east, south, west },
      owner,
      accent: accents[(index + owner) % accents.length],
    }
  })
}

function createPlayerState(owner: PlayerId): PlayerState {
  const cards = shuffled(makeDeck(owner), 20261027 + owner * 571)
  return {
    shields: cards.slice(0, 4),
    hand: cards.slice(4, 8),
    deck: cards.slice(8),
    frontline: Array<Card | null>(4).fill(null),
    deployment: Array<Card | null>(4).fill(null),
    discard: [],
  }
}

function createInitialGame(): GameState {
  const players: [PlayerState, PlayerState] = [createPlayerState(0), createPlayerState(1)]
  return {
    players,
    active: 0,
    turn: 1,
    summonsThisTurn: 0,
    attacked: [],
    winner: null,
    log: ['対局開始。先攻プレイヤー1のターンです。'],
  }
}

function ShapeMark({ shape, className = '' }: { shape: Shape; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shape-mark shape-mark-${shape} ${className}`} aria-hidden="true">
      {shape === 'circle' && <path d="M12 4a8 8 0 0 1 0 16V4Z" />}
      {shape === 'star' && <polygon points="12,3 14.7,8.4 20.7,9.2 16.3,13.4 17.4,19.4 12,16.6 6.6,19.4 7.7,13.4 3.3,9.2 9.3,8.4" />}
      {shape === 'diamond' && <polygon points="12,3 21,12 12,21 3,12" />}
    </svg>
  )
}

function getPower(game: GameState, playerId: PlayerId, lane: number, stage: 'frontline' | 'deployment') {
  const player = game.players[playerId]
  const row = stage === 'frontline' ? player.frontline : player.deployment
  const card = row[lane]
  if (!card) return 0
  const links: Shape[] = []
  const horizontalNeighbors = [lane > 0 ? lane - 1 : -1, lane < 3 ? lane + 1 : -1]
  for (const neighborLane of horizontalNeighbors) {
    if (neighborLane < 0) continue
    const other = row[neighborLane]
    if (!other) continue
    const shape = neighborLane < lane
      ? card.ports.west && card.ports.west === other.ports.east ? card.ports.west : null
      : card.ports.east && card.ports.east === other.ports.west ? card.ports.east : null
    if (shape) links.push(shape)
  }
  const adjacentStage = stage === 'frontline' ? player.deployment : player.frontline
  const adjacent = adjacentStage[lane]
  if (adjacent) {
    const shape = stage === 'frontline'
      ? card.ports.south && card.ports.south === adjacent.ports.north ? card.ports.south : null
      : card.ports.north && card.ports.north === adjacent.ports.south ? card.ports.north : null
    if (shape) links.push(shape)
  }
  const distinct = new Set(links)
  const synergy = distinct.has('circle') && distinct.has('diamond') ? 50 : 0
  return card.basePower + links.reduce((sum, shape) => sum + shapeMeta[shape].bonus, 0) + synergy
}

function BoardCard({
  card,
  power,
  selected = false,
  faceDown = false,
  compact = false,
  onClick,
  disabled = false,
  attacked = false,
}: {
  card: Card | null
  power?: number
  selected?: boolean
  faceDown?: boolean
  compact?: boolean
  onClick?: () => void
  disabled?: boolean
  attacked?: boolean
}) {
  if (!card && !faceDown) return null
  if (faceDown) {
    return (
      <div className={`shield-back ${compact ? 'shield-back-compact' : ''}`} aria-label="裏向きのシールド">
        <Shield aria-hidden="true" />
        <span>SHIELD</span>
      </div>
    )
  }
  if (!card) return null
  const Port = ({ side, shape }: { side: keyof Ports; shape: Shape | null }) => (
    <span className={`port port-${side} ${shape ? `port-${shape}` : ''}`} aria-label={`${side}: ${shape ? shapeMeta[shape].label : 'なし'}`}>
      {shape ? <ShapeMark shape={shape} /> : <span className="port-empty" />}
    </span>
  )
  const content = (
    <>
      <span className="card-topline"><span>{card.family}</span><span className="card-id">{card.id.slice(-2)}</span></span>
      <Port side="north" shape={card.ports.north} />
      <Port side="east" shape={card.ports.east} />
      <Port side="south" shape={card.ports.south} />
      <Port side="west" shape={card.ports.west} />
      <span className="card-name">{card.name}</span>
      <span className="card-power">{power ?? card.basePower}</span>
      <span className="card-power-label">POWER</span>
      {attacked && <span className="attacked-mark">行動済</span>}
    </>
  )
  const className = `unit-card accent-${card.accent} ${compact ? 'unit-card-compact' : ''} ${selected ? 'unit-card-selected' : ''} ${attacked ? 'unit-card-attacked' : ''}`
  return onClick ? (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={`${card.name} パワー ${power ?? card.basePower}${selected ? ' 選択中' : ''}`}>
      {content}
    </button>
  ) : (
    <div className={className} aria-label={`${card.name} パワー ${power ?? card.basePower}`}>{content}</div>
  )
}

function PlayerBanner({
  playerId,
  active,
  handCount,
  shieldCount,
  deckCount,
  opponent = false,
}: {
  playerId: PlayerId
  active: boolean
  handCount: number
  shieldCount: number
  deckCount: number
  opponent?: boolean
}) {
  return (
    <div className={`player-banner ${opponent ? 'opponent-banner' : ''} ${active ? 'player-banner-active' : ''}`}>
      <div className={`player-avatar player-avatar-${playerId}`} aria-hidden="true">{playerId + 1}</div>
      <div className="player-name-block">
        <strong>プレイヤー {playerId + 1}</strong>
        <span>{active ? 'ACTIVE TURN' : 'STANDBY'}</span>
      </div>
      <div className="player-stats">
        <span title="手札"><Layers3 /> <b>{handCount}</b></span>
        <span title="シールド"><Shield /> <b>{shieldCount}</b></span>
        <span title="山札"><ArrowDownToLine /> <b>{deckCount}</b></span>
      </div>
    </div>
  )
}

function FieldBoard({
  game,
  playerId,
  opponent = false,
  selectedAttacker = null,
  onDeploy,
  onSelectAttacker,
  pendingDeployment,
}: {
  game: GameState
  playerId: PlayerId
  opponent?: boolean
  selectedAttacker?: string | null
  onDeploy?: (lane: number) => void
  onSelectAttacker?: (card: Card, lane: number) => void
  pendingDeployment?: PendingDeployment
}) {
  const player = game.players[playerId]
  const stages = opponent
    ? [
        { key: 'frontline' as const, label: '最前線', cards: player.frontline },
        { key: 'deployment' as const, label: '出撃', cards: player.deployment },
        { key: 'shield' as const, label: 'シールド', cards: player.shields },
      ]
    : [
        { key: 'shield' as const, label: 'シールド', cards: player.shields },
        { key: 'deployment' as const, label: '出撃', cards: player.deployment },
        { key: 'frontline' as const, label: '最前線', cards: player.frontline },
      ]
  return (
    <div className={`field-board ${opponent ? 'field-board-opponent' : 'field-board-own'}`}>
      {stages.map((stage) => (
        <div className={`board-row board-row-${stage.key}`} key={stage.key}>
          <div className="row-label"><span>{stage.label}</span>{stage.key === 'deployment' && <ArrowUpRight aria-hidden="true" />}</div>
          <div className="lane-grid">
            {stage.cards.map((card, lane) => {
              const isFront = stage.key === 'frontline'
              const isDeploy = stage.key === 'deployment'
              const isShield = stage.key === 'shield'
              const canClickDeploy = !opponent && isDeploy && !game.winner
              const canClickFront = !opponent && isFront && Boolean(card) && !game.winner
              const isPendingLane = pendingDeployment?.lane === lane
              return (
                <div className={`board-cell ${isPendingLane ? 'board-cell-pending' : ''}`} key={`${stage.key}-${lane}`}>
                  {isShield && card ? <BoardCard card={card} faceDown compact /> : null}
                  {isDeploy && card ? (
                    <BoardCard
                      card={card}
                      power={getPower(game, playerId, lane, 'deployment')}
                      compact
                      selected={isPendingLane}
                      onClick={canClickDeploy && onDeploy ? () => onDeploy(lane) : undefined}
                    />
                  ) : null}
                  {isFront && card ? (
                    <BoardCard
                      card={card}
                      power={getPower(game, playerId, lane, 'frontline')}
                      compact
                      selected={selectedAttacker === card.id}
                      attacked={game.attacked.includes(card.id)}
                      disabled={opponent}
                      onClick={canClickFront && onSelectAttacker ? () => onSelectAttacker(card, lane) : undefined}
                    />
                  ) : null}
                  {!card && !isShield && (
                    <button
                      className={`empty-slot ${canClickDeploy ? 'empty-slot-deploy' : ''} ${isFront && !opponent ? 'empty-slot-front' : ''}`}
                      type="button"
                      onClick={canClickDeploy && onDeploy ? () => onDeploy(lane) : undefined}
                      disabled={!canClickDeploy}
                      aria-label={`${lane + 1}レーン ${stage.label}${canClickDeploy ? 'に配置' : '空き'}`}
                    >
                      {canClickDeploy ? <span>＋</span> : isFront && !opponent ? <span className="frontline-target">{lane + 1}</span> : <span className="slot-dash">·</span>}
                    </button>
                  )}
                  <span className="lane-index">{lane + 1}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function HandCard({ card, selected, discardMode, onClick }: { card: Card; selected: boolean; discardMode: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`hand-card accent-${card.accent} ${selected ? 'hand-card-selected' : ''} ${discardMode ? 'hand-card-discard' : ''}`} onClick={onClick}>
      <span className="hand-card-top"><span>{card.family}</span><span>{card.id.slice(-2)}</span></span>
      <span className="hand-glyph"><ShapeMark shape={card.ports.north ?? 'circle'} /></span>
      <strong>{card.name}</strong>
      <span className="hand-card-power">{card.basePower}<small> PWR</small></span>
      <span className="hand-edges">{card.ports.west && <ShapeMark shape={card.ports.west} />}<i />{card.ports.east && <ShapeMark shape={card.ports.east} />}</span>
    </button>
  )
}

export default function TacticalGame() {
  const [game, setGame] = useState<GameState>(() => createInitialGame())
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [selectedAttacker, setSelectedAttacker] = useState<string | null>(null)
  const [pendingDeployment, setPendingDeployment] = useState<PendingDeployment>(null)
  const [handoff, setHandoff] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const activePlayer = game.players[game.active]
  const opponentId = (1 - game.active) as PlayerId
  const selectedCard = activePlayer.hand.find((card) => card.id === selectedCardId) ?? null
  const selectedAttackCard = activePlayer.frontline.flat().find((card) => card?.id === selectedAttacker) ?? null
  const canAttack = selectedAttackCard && !game.attacked.includes(selectedAttackCard.id) && !game.winner
  const lastLog = game.log[0]

  const addLog = (next: GameState, message: string) => ({ ...next, log: [message, ...next.log].slice(0, 6) })

  const deploy = (lane: number, cardId: string, discardId?: string) => {
    setGame((current) => {
      if (current.winner || current.active !== game.active) return current
      const player = current.players[current.active]
      const card = player.hand.find((item) => item.id === cardId)
      if (!card) return current
      if (current.summonsThisTurn > 0 && (!discardId || discardId === cardId || !player.hand.some((item) => item.id === discardId))) return current
      const nextPlayers = current.players.map((item) => ({
        ...item,
        hand: [...item.hand],
        deck: [...item.deck],
        frontline: [...item.frontline],
        deployment: [...item.deployment],
        shields: [...item.shields],
        discard: [...item.discard],
      })) as [PlayerState, PlayerState]
      const nextPlayer = nextPlayers[current.active]
      if (discardId) {
        const discarded = nextPlayer.hand.find((item) => item.id === discardId)
        nextPlayer.hand = nextPlayer.hand.filter((item) => item.id !== discardId && item.id !== cardId)
        if (discarded) nextPlayer.discard.push(discarded)
      } else {
        nextPlayer.hand = nextPlayer.hand.filter((item) => item.id !== cardId)
      }
      const returned = nextPlayer.frontline[lane]
      if (returned) nextPlayer.hand.push(returned)
      nextPlayer.frontline[lane] = nextPlayer.deployment[lane]
      nextPlayer.deployment[lane] = card
      const newState = { ...current, players: nextPlayers, summonsThisTurn: current.summonsThisTurn + 1 }
      const costText = discardId ? '手札を1枚捨てて追加召喚。' : 'カードを出撃ゾーンへ配置。'
      const returnedText = returned ? ` 最前線の${returned.name}は手札に戻った。` : ''
      return addLog(newState, `P${current.active + 1}：${costText}${returnedText}`)
    })
    setSelectedCardId(null)
    setSelectedAttacker(null)
    setPendingDeployment(null)
  }

  const onDeployLane = (lane: number) => {
    if (!selectedCard) return
    if (game.summonsThisTurn > 0) {
      if (activePlayer.hand.length < 2) return
      setPendingDeployment({ cardId: selectedCard.id, lane })
      setSelectedCardId(null)
      return
    }
    deploy(lane, selectedCard.id)
  }

  const chooseHandCard = (card: Card) => {
    if (pendingDeployment) {
      if (card.id === pendingDeployment.cardId) return
      deploy(pendingDeployment.lane, pendingDeployment.cardId, card.id)
      return
    }
    setSelectedCardId((current) => current === card.id ? null : card.id)
  }

  const attack = () => {
    if (!selectedAttackCard || !canAttack) return
    const lane = activePlayer.frontline.findIndex((card) => card?.id === selectedAttackCard.id)
    if (lane < 0) return
    setGame((current) => {
      if (current.winner) return current
      const attackerPlayer = current.players[current.active]
      const defenderId = (1 - current.active) as PlayerId
      const defenderPlayer = current.players[defenderId]
      const attackerPower = getPower(current, current.active, lane, 'frontline')
      const defender = defenderPlayer.frontline[lane]
      const defenderPower = defender ? getPower(current, defenderId, lane, 'frontline') : 0
      const nextPlayers = current.players.map((item) => ({
        ...item,
        hand: [...item.hand],
        deck: [...item.deck],
        frontline: [...item.frontline],
        deployment: [...item.deployment],
        shields: [...item.shields],
        discard: [...item.discard],
      })) as [PlayerState, PlayerState]
      const nextAttacker = nextPlayers[current.active]
      const nextDefender = nextPlayers[defenderId]
      const attackingCard = nextAttacker.frontline[lane]
      if (!attackingCard || current.attacked.includes(attackingCard.id)) return current
      nextAttacker.frontline[lane] = attackingCard
      let nextState: GameState = { ...current, players: nextPlayers, attacked: [...current.attacked, attackingCard.id] }
      if (defender) {
        nextDefender.frontline[lane] = null
        if (attackerPower > defenderPower) {
          nextDefender.discard.push(defender)
          nextState = addLog(nextState, `P${current.active + 1}の攻撃！${defender.name}（${defenderPower}）を撃破。`)
        } else if (attackerPower < defenderPower) {
          nextAttacker.frontline[lane] = null
          nextAttacker.discard.push(attackingCard)
          nextState = addLog(nextState, `反撃で${attackingCard.name}が撃破された。`)
        } else {
          nextAttacker.frontline[lane] = null
          nextAttacker.discard.push(attackingCard)
          nextDefender.discard.push(defender)
          nextState = addLog(nextState, `同じパワー！${attackingCard.name}と${defender.name}は相打ち。`)
        }
      } else if (nextDefender.deployment[lane]) {
        nextState = addLog(nextState, `レーン${lane + 1}は出撃カードに守られている。`)
      } else if (nextDefender.shields[lane]) {
        const brokenShield = nextDefender.shields[lane]
        nextDefender.shields[lane] = null
        nextDefender.hand.push(brokenShield)
        nextState = addLog(nextState, `シールド破壊！P${defenderId + 1}は${brokenShield.name}を手札に加えた。`)
      } else {
        nextState = { ...nextState, winner: current.active }
        nextState = addLog(nextState, `レーン${lane + 1}を突破！プレイヤー${current.active + 1}の勝利。`)
      }
      return nextState
    })
    setSelectedAttacker(null)
  }

  const endTurn = () => {
    if (game.winner) return
    const nextPlayerId = (1 - game.active) as PlayerId
    setGame((current) => {
      if (current.winner) return current
      const nextPlayers = current.players.map((item) => ({
        ...item,
        hand: [...item.hand],
        deck: [...item.deck],
        frontline: [...item.frontline],
        deployment: [...item.deployment],
        shields: [...item.shields],
        discard: [...item.discard],
      })) as [PlayerState, PlayerState]
      const nextPlayer = nextPlayers[nextPlayerId]
      let drawMessage = ''
      if (nextPlayer.deck.length > 0) {
        nextPlayer.hand.push(nextPlayer.deck.shift() as Card)
        drawMessage = ' 1枚ドロー。'
      }
      const next = addLog({
        ...current,
        players: nextPlayers,
        active: nextPlayerId,
        turn: current.turn + 1,
        summonsThisTurn: 0,
        attacked: [],
      }, `P${nextPlayerId + 1}のターン開始。${drawMessage}`)
      return next
    })
    setSelectedAttacker(null)
    setSelectedCardId(null)
    setPendingDeployment(null)
    setHandoff(true)
  }

  const resetGame = () => {
    setGame(createInitialGame())
    setSelectedCardId(null)
    setSelectedAttacker(null)
    setPendingDeployment(null)
    setHandoff(false)
  }

  const handSummary = useMemo(() => activePlayer.hand.length, [activePlayer.hand.length])
  const opponent = game.players[opponentId]

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup">
          <div className="brand-mark"><ArrowLeftRight aria-hidden="true" /></div>
          <div><p className="brand-kicker">TACTICAL CARD GAME</p><h1>RELAY<span> / </span>レイリー</h1></div>
        </div>
        <div className="header-actions">
          <button type="button" className="icon-button" aria-label="遊び方" onClick={() => setHelpOpen(true)}><CircleHelp /></button>
          <button type="button" className="icon-button" aria-label="対局をリセット" onClick={resetGame}><RotateCcw /></button>
        </div>
      </header>

      <div className="match-meta">
        <div className="turn-chip"><span className="live-dot" /> TURN {String(game.turn).padStart(2, '0')}</div>
        <p>{game.winner !== null ? `PLAYER ${game.winner + 1} VICTORY` : `PLAYER ${game.active + 1} のターン`}</p>
        <span className="round-label">LOCAL MATCH <span>·</span> 1 DEVICE</span>
      </div>

      <section className="opponent-section" aria-label="相手のフィールド">
        <PlayerBanner playerId={opponentId} active={game.active === opponentId} handCount={opponent.hand.length} shieldCount={opponent.shields.filter(Boolean).length} deckCount={opponent.deck.length} opponent />
        <FieldBoard game={game} playerId={opponentId} opponent />
      </section>

      <div className="battle-divider" aria-hidden="true">
        <span className="divider-line" /><span className="divider-label"><Swords /> BATTLE LINE</span><span className="divider-line" />
      </div>

      <section className="own-section" aria-label="自分のフィールド">
        <FieldBoard
          game={game}
          playerId={game.active}
          selectedAttacker={selectedAttacker}
          onDeploy={onDeployLane}
          onSelectAttacker={(card) => setSelectedAttacker((current) => current === card.id ? null : card.id)}
          pendingDeployment={pendingDeployment}
        />
        <PlayerBanner playerId={game.active} active handCount={handSummary} shieldCount={activePlayer.shields.filter(Boolean).length} deckCount={activePlayer.deck.length} />
      </section>

      <section className="hand-panel" aria-label={`プレイヤー${game.active + 1}の手札`}>
        <div className="hand-heading">
          <div><span className="section-eyebrow">YOUR HAND</span><h2>手札 <span>{activePlayer.hand.length}</span></h2></div>
          <div className="hand-instruction">
            {pendingDeployment ? <><X /> 出撃カード以外を1枚選んで破棄</> : selectedCard ? <><ArrowUpRight /> 配置するレーンを選択</> : <><Sparkles /> カードを選んで出撃</>}
          </div>
        </div>
        <div className="hand-scroller">
          {activePlayer.hand.map((card) => (
            <HandCard
              key={card.id}
              card={card}
              selected={selectedCardId === card.id || pendingDeployment?.cardId === card.id}
              discardMode={Boolean(pendingDeployment) && pendingDeployment?.cardId !== card.id}
              onClick={() => chooseHandCard(card)}
            />
          ))}
          {activePlayer.hand.length === 0 && <p className="empty-hand">手札がありません。ターン終了時に次のプレイヤーがカードを引きます。</p>}
        </div>
        <div className="hand-footnote">
          <span><span className="footnote-dot footnote-free" /> 1体目は無料</span>
          <span><span className="footnote-dot footnote-cost" /> 2体目以降は手札1枚を破棄</span>
          <span className="summon-count">このターン {game.summonsThisTurn} 回召喚</span>
        </div>
      </section>

      <section className="action-dock" aria-label="ターン操作">
        <div className="action-context">
          {canAttack ? <><Swords /><span>{selectedAttackCard?.name}でレーン{activePlayer.frontline.findIndex((card) => card?.id === selectedAttacker) + 1}を攻撃</span></> : selectedAttacker && game.attacked.includes(selectedAttacker) ? <><Swords /><span>このユニットは行動済みです</span></> : <><ChevronRight /><span>{lastLog}</span></>}
        </div>
        <div className="dock-buttons">
          <button type="button" className="attack-button" onClick={attack} disabled={!canAttack || handoff || game.winner !== null}><Swords /> 攻撃</button>
          <button type="button" className="end-turn-button" onClick={endTurn} disabled={handoff || game.winner !== null}>ターン終了 <ArrowUpRight /></button>
        </div>
      </section>

      {game.winner !== null && (
        <div className="victory-banner" role="status">
          <span className="victory-kicker">MATCH COMPLETE</span><strong>PLAYER {game.winner + 1} VICTORY</strong><p>レーンを突破しました。</p>
          <button type="button" onClick={resetGame}><RotateCcw /> もう一度プレイ</button>
        </div>
      )}

      {handoff && (
        <div className="handoff-overlay" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
          <div className="handoff-card">
            <div className="handoff-icon"><ArrowLeftRight /></div>
            <span className="section-eyebrow">PASS &amp; PLAY</span>
            <h2 id="handoff-title">プレイヤー{game.active + 1}の番です</h2>
            <p>画面を次のプレイヤーに渡してください。手札は開始後に表示されます。</p>
            <button type="button" onClick={() => setHandoff(false)}>プレイヤー{game.active + 1}として開始 <ChevronRight /></button>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="help-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={() => setHelpOpen(false)}>
          <div className="help-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="help-close" aria-label="閉じる" onClick={() => setHelpOpen(false)}><X /></button>
            <span className="section-eyebrow">HOW TO PLAY</span><h2 id="help-title">遊び方</h2>
            <ol>
              <li><b>出撃：</b>手札を選び、自分の「出撃」列のレーンをタップ。カードは上へ押し出され、最前線から戻るカードは手札に入ります。</li>
              <li><b>追加召喚：</b>2体目以降は配置レーンを選んだあと、別の手札1枚を破棄します。</li>
              <li><b>図形：</b>隣り合う同じ図形パーツが接続。円+10、菱+25、星+50。円と菱の両方が接続すると追加+50。</li>
              <li><b>攻撃：</b>自分の最前線カードを選択して「攻撃」。同じレーンの敵カードとパワー勝負し、敵の出撃カードは直接突破できません。</li>
              <li><b>シールド：</b>守りがいないレーンを攻撃するとシールドを破壊。破壊されたシールドは持ち主の手札に戻ります。シールドと敵カードがないレーンを攻撃すると勝利。</li>
              <li><b>ターン：</b>先攻1ターン目はドローなし。その後のターン開始時に1枚引きます。</li>
            </ol>
            <button type="button" className="help-done" onClick={() => setHelpOpen(false)}>ゲームに戻る</button>
          </div>
        </div>
      )}

      <footer className="game-footer"><span>RELAY TCG</span><span>4 LANES <i /> 20 CARDS <i /> 2 PLAYERS</span></footer>
    </main>
  )
}
