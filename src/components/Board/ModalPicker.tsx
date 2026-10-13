import { useState } from 'react'
import type { ModalRun } from './triggerUtils'
import { effectLabelFor } from './triggerUtils'

interface ModalPickerProps {
  run: ModalRun
  resolveTrigger: (triggerId: string) => void
  skipTrigger: (triggerId: string) => void
}

/**
 * One grouped decision for a "Choose one/two —" spell: instead of independent
 * Resolve/Skip rows, the modes render as selectable chips and Confirm resolves
 * exactly the chosen number (skipping the rest).
 */
export function ModalPicker({ run, resolveTrigger, skipTrigger }: ModalPickerProps) {
  const [selected, setSelected] = useState<string[]>([])
  const complete = selected.length === run.maxChoices

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      // Single-choice groups replace; multi-choice fills up to the limit.
      if (run.maxChoices === 1) return [id]
      if (current.length >= run.maxChoices) return current
      return [...current, id]
    })
  }

  const confirm = () => {
    for (const instance of run.instances) {
      if (selected.includes(instance.id)) resolveTrigger(instance.id)
      else skipTrigger(instance.id)
    }
    setSelected([])
  }

  const skipAll = () => {
    for (const id of run.ids) skipTrigger(id)
    setSelected([])
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(255,179,64,0.08)',
        border: '1px solid rgba(255,179,64,0.4)',
      }}
    >
      <div style={{ fontSize: '0.82rem', color: '#e6edf3', marginBottom: 4 }}>
        <strong style={{ color: '#79c0ff' }}>{run.sourceCardName}</strong>
        {' — '}
        choose {run.maxChoices === 1 ? 'a mode' : `${run.maxChoices} modes`}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
        {run.instances.map((instance) => {
          const chosen = selected.includes(instance.id)
          const targeted = instance.ability.targets > 0
          const label = effectLabelFor(instance.ability.effect.kind, instance.ability.effect.params as Record<string, unknown>)
          return (
            <button
              key={instance.id}
              type="button"
              onClick={() => toggle(instance.id)}
              title={targeted ? 'This mode needs a target after confirming' : label}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: `1px solid ${chosen ? 'rgba(255,179,64,0.65)' : 'rgba(255,255,255,0.14)'}`,
                background: chosen ? 'rgba(255,179,64,0.18)' : 'rgba(13,17,23,0.6)',
                color: chosen ? '#ffb340' : '#e6edf3',
                cursor: 'pointer',
                fontSize: '0.74rem',
                fontWeight: chosen ? 700 : 500,
              }}
            >
              {label}
              {targeted && (
                <span style={{ color: '#8b949e', marginLeft: 5, fontSize: '0.64rem' }}>⌖ target</span>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={skipAll}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid #484f58',
            background: 'transparent',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: '0.7rem',
          }}
        >
          Skip all
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!complete}
          style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: '1px solid rgba(88,166,255,0.5)',
            background: complete ? 'rgba(88,166,255,0.15)' : 'transparent',
            color: complete ? '#79c0ff' : '#484f58',
            cursor: complete ? 'pointer' : 'default',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
        >
          Resolve ({selected.length}/{run.maxChoices})
        </button>
      </div>
    </div>
  )
}
