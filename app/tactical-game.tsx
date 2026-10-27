'use client'

import { useState, type ReactNode } from 'react'
import { ArrowDownToLine, ChevronRight, CircleHelp, Layers3, RotateCcw, Shield, Swords, Trash2, X } from 'lucide-react'

type PlayerId = 0 | 1
type Shape = 'circle' | 'star' | 'diamond'
type EdgeShape = 'circle' | 'diamond'
type Edge = 'north' | 'east' | 'south' | 'west'
type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Need = Partial<Record<Shape, number>>
type Card = {
  id: string
  edges: Partial<Record<Edge, EdgeShape>>
  corners: Partial<Record<Corner, 'star'>>
  need: Need
  power: number
  owner: PlayerId
  accent: 'coral' | 'teal' | 'gold' | 'violet'
}
type FieldAnalysis = { counts: Record<Shape, number>; linked: Set<string> }
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
}
type PendingDeployment = { cardId: string; lane: number } | null
type RowKey = 'frontline' | 'deployment' | 'shield'

const shapeLabel: Record<Shape, string> = { circle: '丸', star: '星', diamond: 'ダイヤ' }
const shapeOrder: Shape[] = ['circle', 'diamond', 'star']
const edgeShapes: EdgeShape[] = ['circle', 'diamond']
const cornerKeys: Corner[] = ['nw', 'ne', 'sw', 'se']
const conditions: { need: Need; power: number }[] = [
  { need: { circle: 1 }, power: 20 },
  { need: { diamond: 1 }, power: 30 },
  { need: { circle: 2 }, power: 50 },
  { need: { circle: 1, diamond: 1 }, power: 60 },
  { need: { diamond: 2 }, power: 70 },
  { need: { star: 1 }, power: 90 },
]
const accents: Card['accent'][] = ['coral', 'teal', 'gold', 'violet']
const edgePoint: Record<Edge, [number, number]> = { north: [31.5, 0], east: [63, 44], south: [31.5, 88], west: [0, 44] }
const cornerPoint: Record<Corner, [number, number]> = { nw: [0, 0], ne: [63, 0], sw: [0, 88], se: [63, 88] }

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
  let seed = 9173 + owner * 7919
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]
  return Array.from({ length: 20 }, (_, index) => {
    const edges: Card['edges'] = { north: pick(edgeShapes), south: pick(edgeShapes) }
    if (rand() < 0.55) edges.east = pick(edgeShapes)
    if (rand() < 0.55) edges.west = pick(edgeShapes)
    const corners: Card['corners'] = {}
    for (const corner of cornerKeys) if (rand() < 0.4) corners[corner] = 'star'
    const condition = conditions[(index + owner) % conditions.length]
    return {
      id: `p${owner + 1}-${String(index + 1).padStart(2, '0')}`,
      edges,
      corners,
      need: condition.need,
      power: condition.power,
      owner,
      accent: accents[(index + owner) % accents.length],
    }
  })
}

function analyzeField(player: PlayerState): FieldAnalysis {
  const counts: Record<Shape, number> = { circle: 0, diamond: 0, star: 0 }
  const linked = new Set<string>()
  const { frontline: front, deployment: deploy } = player
  for (const row of [front, deploy]) {
    for (let lane = 0; lane < 3; lane += 1) {
      const left = row[lane]
      const right = row[lane + 1]
      if (left?.edges.east && left.edges.east === right?.edges.west) {
        counts[left.edges.east] += 1
        linked.add(`${left.id}:east`)
        linked.add(`${right.id}:west`)
      }
    }
  }
  for (let lane = 0; lane < 4; lane += 1) {
    const top = front[lane]
    const bottom = deploy[lane]
    if (top?.edges.south && top.edges.south === bottom?.edges.north) {
      counts[top.edges.south] += 1
      linked.add(`${top.id}:south`)
      linked.add(`${bottom.id}:north`)
    }
  }
  for (let lane = 0; lane < 3; lane += 1) {
    const quad = [
      [front[lane], 'se'],
      [front[lane + 1], 'sw'],
      [deploy[lane], 'ne'],
      [deploy[lane + 1], 'nw'],
    ] as const
    if (quad.every(([card, corner]) => card?.corners[corner] === 'star')) {
      counts.star += 1
      for (const [card, corner] of quad) linked.add(`${card?.id}:${corner}`)
    }
  }
  return { counts, linked }
}

function meetsNeed(card: Card, counts: Record<Shape, number>) {
  return shapeOrder.every((shape) => counts[shape] >= (card.need[shape] ?? 0))
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
  return { players: [createPlayerState(0), createPlayerState(1)], active: 0, turn: 1, summonsThisTurn: 0, attacked: [], winner: null }
}

function clonePlayers(players: [PlayerState, PlayerState]) {
  return players.map((item) => ({
    ...item,
    hand: [...item.hand],
    deck: [...item.deck],
    frontline: [...item.frontline],
    deployment: [...item.deployment],
    shields: [...item.shields],
    discard: [...item.discard],
  })) as [PlayerState, PlayerState]
}

function getPower(game: GameState, playerId: PlayerId, lane: number, stage: 'frontline' | 'deployment') {
  const player = game.players[playerId]
  const row = stage === 'frontline' ? player.frontline : player.deployment
  const card = row[lane]
  if (!card) return 0
  return meetsNeed(card, analyzeField(player).counts) ? card.power : 0
}

function ShapePath({ shape, cx, cy, r }: { shape: Shape; cx: number; cy: number; r: number }) {
  if (shape === 'circle') return <circle cx={cx} cy={cy} r={r} />
  if (shape === 'diamond') return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} />
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45
    const angle = (Math.PI / 5) * i - Math.PI / 2
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`
  }).join(' ')
  return <polygon points={points} />
}

function ShapeMark({ shape }: { shape: Shape }) {
  return (
    <svg viewBox="0 0 24 24" className={`shape-mark shape-${shape}`} aria-hidden="true">
      <ShapePath shape={shape} cx={12} cy={12} r={shape === 'circle' ? 8 : 9.5} />
    </svg>
  )
}

function NeedIcons({ need }: { need: Need }) {
  return (
    <span className="card-need">
      {shapeOrder.flatMap((shape) => Array.from({ length: need[shape] ?? 0 }, (_, i) => <ShapeMark key={`${shape}-${i}`} shape={shape} />))}
    </span>
  )
}

function CardFace({
  card,
  active = false,
  linked,
  selected = false,
  dimmed = false,
  danger = false,
  onClick,
}: {
  card: Card
  active?: boolean
  linked?: Set<string>
  selected?: boolean
  dimmed?: boolean
  danger?: boolean
  onClick?: () => void
}) {
  const className = ['tcg-card', `accent-${card.accent}`, active && 'is-active', selected && 'is-selected', dimmed && 'is-dimmed', danger && 'is-danger'].filter(Boolean).join(' ')
  const needText = shapeOrder.filter((shape) => card.need[shape]).map((shape) => `${shapeLabel[shape]}${card.need[shape]}`).join('・')
  const label = `${active ? `パワー${card.power}` : `待機（${needText}完成でパワー${card.power}）`}`
  const body = (
    <>
      <svg className="card-parts" viewBox="0 0 63 88" aria-hidden="true">
        {(Object.entries(card.edges) as [Edge, EdgeShape][]).map(([edge, shape]) => (
          <g key={edge} className={`part shape-${shape} ${linked?.has(`${card.id}:${edge}`) ? 'is-linked' : ''}`}>
            <ShapePath shape={shape} cx={edgePoint[edge][0]} cy={edgePoint[edge][1]} r={shape === 'circle' ? 10 : 12} />
          </g>
        ))}
        {(Object.keys(card.corners) as Corner[]).map((corner) => (
          <g key={corner} className={`part shape-star ${linked?.has(`${card.id}:${corner}`) ? 'is-linked' : ''}`}>
            <ShapePath shape="star" cx={cornerPoint[corner][0]} cy={cornerPoint[corner][1]} r={17} />
          </g>
        ))}
      </svg>
      <span className="card-core">
        <NeedIcons need={card.need} />
        <span className="card-power">{card.power}</span>
      </span>
      {danger && <Trash2 className="card-trash" aria-hidden="true" />}
    </>
  )
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-label={label} aria-pressed={selected}>{body}</button>
  ) : (
    <div className={className} role="img" aria-label={label}>{body}</div>
  )
}

function ShieldBack() {
  return (
    <div className="tcg-card shield-back" role="img" aria-label="シールド">
      <Shield aria-hidden="true" />
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
  onSelectAttacker?: (card: Card) => void
  pendingDeployment?: PendingDeployment
}) {
  const player = game.players[playerId]
  const analysis = analyzeField(player)
  const rows: RowKey[] = opponent ? ['shield', 'deployment', 'frontline'] : ['frontline', 'deployment', 'shield']
  const rowCards = { frontline: player.frontline, deployment: player.deployment, shield: player.shields }
  const rowName = { frontline: '最前線', deployment: '出撃', shield: 'シールド' }
  return (
    <div className="field-board">
      {rows.map((row) => (
        <div className={`lane-row lane-row-${row}`} key={row} role="group" aria-label={rowName[row]}>
          {rowCards[row].map((card, lane) => {
            const canDeploy = !opponent && row === 'deployment' && game.winner === null && Boolean(onDeploy)
            const isPending = !opponent && row === 'deployment' && pendingDeployment?.lane === lane
            let content: ReactNode
            if (row === 'shield') {
              content = card ? <ShieldBack /> : <span className="slot" aria-label="空き" />
            } else if (card) {
              const active = meetsNeed(card, analysis.counts)
              if (row === 'frontline') {
                const canSelect = !opponent && game.winner === null && Boolean(onSelectAttacker) && active
                content = (
                  <CardFace
                    card={card}
                    active={active}
                    linked={analysis.linked}
                    selected={selectedAttacker === card.id}
                    dimmed={!opponent && game.attacked.includes(card.id)}
                    onClick={canSelect ? () => onSelectAttacker?.(card) : undefined}
                  />
                )
              } else {
                content = <CardFace card={card} active={active} linked={analysis.linked} selected={isPending} onClick={canDeploy ? () => onDeploy?.(lane) : undefined} />
              }
            } else if (canDeploy) {
              content = (
                <button type="button" className={`slot slot-deploy ${isPending ? 'is-selected' : ''}`} onClick={() => onDeploy?.(lane)} aria-label={`${lane + 1}レーンに出撃`}>
                  <span aria-hidden="true">+</span>
                </button>
              )
            } else {
              content = <span className="slot" aria-label="空き" />
            }
            return <div className="lane-cell" key={`${row}-${lane}`}>{content}</div>
          })}
        </div>
      ))}
    </div>
  )
}

function Counter({ icon: Icon, value, label }: { icon: typeof Layers3; value: number; label: string }) {
  return (
    <span className="counter" aria-label={`${label} ${value}`}>
      <Icon aria-hidden="true" />
      <b>{value}</b>
    </span>
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
  const opponent = game.players[opponentId]
  const selectedCard = activePlayer.hand.find((card) => card.id === selectedCardId) ?? null
  const selectedAttackCard = activePlayer.frontline.find((card) => card?.id === selectedAttacker) ?? null
  const selectedAttackActive = Boolean(selectedAttackCard) && meetsNeed(selectedAttackCard as Card, analyzeField(activePlayer).counts)
  const canAttack = selectedAttackActive && !game.attacked.includes(selectedAttacker ?? '') && game.winner === null

  const clearSelection = () => {
    setSelectedCardId(null)
    setSelectedAttacker(null)
    setPendingDeployment(null)
  }

  const deploy = (lane: number, cardId: string, discardId?: string) => {
    setGame((current) => {
      if (current.winner !== null) return current
      const player = current.players[current.active]
      if (!player.hand.some((item) => item.id === cardId)) return current
      if (current.summonsThisTurn > 0 && (!discardId || discardId === cardId || !player.hand.some((item) => item.id === discardId))) return current
      const players = clonePlayers(current.players)
      const next = players[current.active]
      const card = next.hand.find((item) => item.id === cardId) as Card
      if (discardId) {
        const discarded = next.hand.find((item) => item.id === discardId)
        if (discarded) next.discard.push(discarded)
      }
      next.hand = next.hand.filter((item) => item.id !== cardId && item.id !== discardId)
      const returned = next.frontline[lane]
      if (returned) next.hand.push(returned)
      next.frontline[lane] = next.deployment[lane]
      next.deployment[lane] = card
      return { ...current, players, summonsThisTurn: current.summonsThisTurn + 1 }
    })
    clearSelection()
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
      if (card.id === pendingDeployment.cardId) {
        setPendingDeployment(null)
        return
      }
      deploy(pendingDeployment.lane, pendingDeployment.cardId, card.id)
      return
    }
    setSelectedAttacker(null)
    setSelectedCardId((current) => (current === card.id ? null : card.id))
  }

  const attack = () => {
    if (!selectedAttackCard || !canAttack) return
    const lane = activePlayer.frontline.findIndex((card) => card?.id === selectedAttackCard.id)
    if (lane < 0) return
    setGame((current) => {
      if (current.winner !== null) return current
      const defenderId = (1 - current.active) as PlayerId
      const attackerPower = getPower(current, current.active, lane, 'frontline')
      const defender = current.players[defenderId].frontline[lane]
      const defenderPower = defender ? getPower(current, defenderId, lane, 'frontline') : 0
      const players = clonePlayers(current.players)
      const atk = players[current.active]
      const def = players[defenderId]
      const attackingCard = atk.frontline[lane]
      if (!attackingCard || attackerPower <= 0 || current.attacked.includes(attackingCard.id)) return current
      const next: GameState = { ...current, players, attacked: [...current.attacked, attackingCard.id] }
      if (defender) {
        if (attackerPower >= defenderPower) {
          def.frontline[lane] = null
          def.discard.push(defender)
        }
        if (attackerPower <= defenderPower) {
          atk.frontline[lane] = null
          atk.discard.push(attackingCard)
        }
      } else if (def.deployment[lane]) {
        return next
      } else if (def.shields[lane]) {
        const broken = def.shields[lane] as Card
        def.shields[lane] = null
        def.hand.push(broken)
      } else {
        next.winner = current.active
      }
      return next
    })
    setSelectedAttacker(null)
  }

  const endTurn = () => {
    if (game.winner !== null) return
    setGame((current) => {
      if (current.winner !== null) return current
      const nextId = (1 - current.active) as PlayerId
      const players = clonePlayers(current.players)
      const nextPlayer = players[nextId]
      const drawn = nextPlayer.deck.shift()
      if (drawn) nextPlayer.hand.push(drawn)
      return { ...current, players, active: nextId, turn: current.turn + 1, summonsThisTurn: 0, attacked: [] }
    })
    clearSelection()
    setHandoff(true)
  }

  const resetGame = () => {
    setGame(createInitialGame())
    clearSelection()
    setHandoff(false)
  }

  const discardMode = Boolean(pendingDeployment)

  return (
    <main className="game-shell">
      <header className="top-bar">
        <span className={`player-chip player-chip-${opponentId}`} aria-label={`相手 P${opponentId + 1}`}>P{opponentId + 1}</span>
        <Counter icon={Layers3} value={opponent.hand.length} label="相手の手札" />
        <Counter icon={ArrowDownToLine} value={opponent.deck.length} label="相手の山札" />
        <div className="top-actions">
          <button type="button" className="icon-button" aria-label="遊び方" onClick={() => setHelpOpen(true)}><CircleHelp aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label="リセット" onClick={resetGame}><RotateCcw aria-hidden="true" /></button>
        </div>
      </header>

      <section className="field field-opponent" aria-label="相手のフィールド">
        <FieldBoard game={game} playerId={opponentId} opponent />
      </section>

      <div className="battle-line" aria-hidden="true" />

      <section className="field field-own" aria-label="自分のフィールド">
        <FieldBoard
          game={game}
          playerId={game.active}
          selectedAttacker={selectedAttacker}
          onDeploy={onDeployLane}
          onSelectAttacker={(card) => {
            setSelectedCardId(null)
            setPendingDeployment(null)
            setSelectedAttacker((current) => (current === card.id ? null : card.id))
          }}
          pendingDeployment={pendingDeployment}
        />
      </section>

      <section className={`hand ${discardMode ? 'hand-discard' : ''}`} aria-label="手札">
        {activePlayer.hand.map((card) => (
          <div className="hand-slot" key={card.id}>
            <CardFace
              card={card}
              selected={selectedCardId === card.id || pendingDeployment?.cardId === card.id}
              danger={discardMode && pendingDeployment?.cardId !== card.id}
              onClick={() => chooseHandCard(card)}
            />
          </div>
        ))}
      </section>

      <nav className="dock" aria-label="操作">
        <span className={`player-chip player-chip-${game.active}`} aria-label={`手番 P${game.active + 1}`}>P{game.active + 1}</span>
        <Counter icon={ArrowDownToLine} value={activePlayer.deck.length} label="山札" />
        <button type="button" className="dock-button attack-button" onClick={attack} disabled={!canAttack || handoff} aria-label="攻撃">
          <Swords aria-hidden="true" />
        </button>
        <button type="button" className="dock-button end-button" onClick={endTurn} disabled={handoff || game.winner !== null} aria-label="ターン終了">
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>

      {game.winner !== null && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={`P${game.winner + 1} 勝利`}>
          <div className="overlay-card">
            <span className={`player-chip player-chip-${game.winner} player-chip-large`}>P{game.winner + 1}</span>
            <strong className="overlay-title">WIN</strong>
            <button type="button" className="overlay-button" onClick={resetGame} aria-label="もう一度"><RotateCcw aria-hidden="true" /></button>
          </div>
        </div>
      )}

      {handoff && game.winner === null && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={`P${game.active + 1} の番`}>
          <div className="overlay-card">
            <span className={`player-chip player-chip-${game.active} player-chip-large`}>P{game.active + 1}</span>
            <button type="button" className="overlay-button" onClick={() => setHandoff(false)} aria-label="開始"><ChevronRight aria-hidden="true" /></button>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={() => setHelpOpen(false)}>
          <div className="overlay-card help-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="help-close" aria-label="閉じる" onClick={() => setHelpOpen(false)}><X aria-hidden="true" /></button>
            <h2 id="help-title">遊び方</h2>
            <ul>
              <li>手札 → 出撃枠で配置。2体目から手札1枚破棄</li>
              <li>最前線を選んで <Swords aria-hidden="true" /> で攻撃</li>
              <li>端の図形パーツを隣・上下でつなぐと図形完成。<ShapeMark shape="star" />は4枚の角で完成</li>
              <li>カード中央の図形が場で揃うと起動し、パワーが出る</li>
              <li>破壊されたシールドは持ち主の手札へ</li>
              <li>空レーンを攻撃で勝利</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  )
}
