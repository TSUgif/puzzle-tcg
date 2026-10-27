'use client'

import { useState, type ReactNode } from 'react'
import { ArrowDownToLine, ChevronRight, CircleHelp, Layers3, RotateCcw, Shield, Swords, Trash2, X } from 'lucide-react'

type PlayerId = 0 | 1
type Shape = 'circle' | 'star' | 'diamond'
type Ports = { north: Shape | null; east: Shape | null; south: Shape | null; west: Shape | null }
type Card = {
  id: string
  name: string
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
}
type PendingDeployment = { cardId: string; lane: number } | null
type RowKey = 'frontline' | 'deployment' | 'shield'

const shapeBonus: Record<Shape, number> = { circle: 10, star: 50, diamond: 25 }
const shapeLabel: Record<Shape, string> = { circle: '円', star: '星', diamond: '菱' }
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
    return {
      id: `p${owner + 1}-${String(index + 1).padStart(2, '0')}`,
      name: cardNames[(index + owner * 3) % cardNames.length],
      basePower: 30 + ((index * 13 + owner * 7) % 5) * 10,
      ports: {
        north: shapeSequence[shift],
        east: index % 4 === 0 ? shapeSequence[(shift + 2) % shapeSequence.length] : null,
        south: shapeSequence[(shift + 1 + (index % 3 === 0 ? 1 : 0)) % shapeSequence.length],
        west: index % 5 === 0 ? shapeSequence[(shift + 3) % shapeSequence.length] : null,
      },
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
  const links: Shape[] = []
  for (const neighborLane of [lane - 1, lane + 1]) {
    if (neighborLane < 0 || neighborLane > 3) continue
    const other = row[neighborLane]
    if (!other) continue
    const shape = neighborLane < lane
      ? card.ports.west && card.ports.west === other.ports.east ? card.ports.west : null
      : card.ports.east && card.ports.east === other.ports.west ? card.ports.east : null
    if (shape) links.push(shape)
  }
  const adjacent = (stage === 'frontline' ? player.deployment : player.frontline)[lane]
  if (adjacent) {
    const shape = stage === 'frontline'
      ? card.ports.south && card.ports.south === adjacent.ports.north ? card.ports.south : null
      : card.ports.north && card.ports.north === adjacent.ports.south ? card.ports.north : null
    if (shape) links.push(shape)
  }
  const distinct = new Set(links)
  const synergy = distinct.has('circle') && distinct.has('diamond') ? 50 : 0
  return card.basePower + links.reduce((sum, shape) => sum + shapeBonus[shape], 0) + synergy
}

function ShapeMark({ shape }: { shape: Shape }) {
  return (
    <svg viewBox="0 0 24 24" className={`shape-mark shape-mark-${shape}`} aria-hidden="true">
      {shape === 'circle' && <circle cx="12" cy="12" r="8" />}
      {shape === 'star' && <polygon points="12,3 14.7,8.4 20.7,9.2 16.3,13.4 17.4,19.4 12,16.6 6.6,19.4 7.7,13.4 3.3,9.2 9.3,8.4" />}
      {shape === 'diamond' && <polygon points="12,3 21,12 12,21 3,12" />}
    </svg>
  )
}

function CardFace({
  card,
  power,
  selected = false,
  dimmed = false,
  danger = false,
  onClick,
}: {
  card: Card
  power?: number
  selected?: boolean
  dimmed?: boolean
  danger?: boolean
  onClick?: () => void
}) {
  const value = power ?? card.basePower
  const className = ['tcg-card', `accent-${card.accent}`, selected && 'is-selected', dimmed && 'is-dimmed', danger && 'is-danger'].filter(Boolean).join(' ')
  const ports = (['north', 'east', 'south', 'west'] as const).map((side) => {
    const shape = card.ports[side]
    return shape ? <span key={side} className={`port port-${side} port-${shape}`}><ShapeMark shape={shape} /></span> : null
  })
  const label = `${card.name} ${value}${(['north', 'east', 'south', 'west'] as const).map((side) => card.ports[side] ? ` ${shapeLabel[card.ports[side] as Shape]}` : '').join('')}`
  const body = (
    <>
      {ports}
      <span className="card-power">{value}</span>
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
              const stage = row === 'frontline' ? 'frontline' : 'deployment'
              const power = getPower(game, playerId, lane, stage)
              if (row === 'frontline') {
                const canSelect = !opponent && game.winner === null && Boolean(onSelectAttacker)
                content = (
                  <CardFace
                    card={card}
                    power={power}
                    selected={selectedAttacker === card.id}
                    dimmed={!opponent && game.attacked.includes(card.id)}
                    onClick={canSelect ? () => onSelectAttacker?.(card) : undefined}
                  />
                )
              } else {
                content = <CardFace card={card} power={power} selected={isPending} onClick={canDeploy ? () => onDeploy?.(lane) : undefined} />
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
  const canAttack = Boolean(selectedAttackCard) && !game.attacked.includes(selectedAttacker ?? '') && game.winner === null

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
      if (!attackingCard || current.attacked.includes(attackingCard.id)) return current
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
              <li>図形一致で強化 <ShapeMark shape="circle" />+10 <ShapeMark shape="diamond" />+25 <ShapeMark shape="star" />+50</li>
              <li>破壊されたシールドは持ち主の手札へ</li>
              <li>空レーンを攻撃で勝利</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  )
}
