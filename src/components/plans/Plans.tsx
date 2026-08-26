import { useState, useEffect, useCallback } from 'react'
import { MessageContent } from '../chat/MessageContent'
import * as api from '../../lib/api'
import './Plans.css'

import { createLogger } from '../../lib/logger'

const log = createLogger('plans')

interface PlansProps {
  isOpen: boolean
  onClose: () => void
  conversationId?: string
  conversationTitle?: string
  onNavigateToConversation?: (id: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
}

const STATUS_ORDER = ['in_progress', 'approved', 'draft', 'completed', 'archived']

export function Plans({ isOpen, onClose, conversationId, onNavigateToConversation }: PlansProps) {
  const [plans, setPlans] = useState<api.Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<api.Plan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filterCurrentTape, setFilterCurrentTape] = useState(false)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filterId = filterCurrentTape ? conversationId : undefined
      const { plans: fetched } = await api.listPlans(50, filterId)
      // Sort by status priority, then by updated time
      fetched.sort((a, b) => {
        const aIdx = STATUS_ORDER.indexOf(a.status)
        const bIdx = STATUS_ORDER.indexOf(b.status)
        if (aIdx !== bIdx) return aIdx - bIdx
        return b.updatedAt - a.updatedAt
      })
      setPlans(fetched)
    } catch (err) {
      setError('Could not load plans. Is the server running?')
      log.warn('Failed to load plans:', err)
    } finally {
      setLoading(false)
    }
  }, [filterCurrentTape, conversationId])

  useEffect(() => {
    if (isOpen) {
      loadPlans()
    }
  }, [isOpen, loadPlans])

  const handleCreatePlan = async () => {
    try {
      const plan = await api.createPlan({
        title: 'New Plan',
        content: '',
        conversationId: conversationId || null,
      })
      setPlans((prev) => [plan, ...prev])
      setSelectedPlan(plan)
    } catch (err) {
      log.warn('Failed to create plan:', err)
    }
  }

  const handleUpdateStatus = async (plan: api.Plan, status: string) => {
    try {
      await api.updatePlan(plan.id, { status })
      setPlans((prev) =>
        prev.map((p) =>
          p.id === plan.id
            ? { ...p, status: status as api.Plan['status'], updatedAt: Date.now() }
            : p,
        ),
      )
      if (selectedPlan?.id === plan.id) {
        setSelectedPlan((prev) => (prev ? { ...prev, status: status as api.Plan['status'] } : null))
      }
    } catch (err) {
      log.warn('Failed to update plan status:', err)
    }
  }

  const handleDeletePlan = async (id: string) => {
    try {
      await api.deletePlan(id)
      setPlans((prev) => prev.filter((p) => p.id !== id))
      if (selectedPlan?.id === id) {
        setSelectedPlan(null)
      }
    } catch (err) {
      log.warn('Failed to delete plan:', err)
    }
  }

  if (!isOpen) return null

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="plans">
      <div className="plans__backdrop" onClick={onClose} />

      <div className="plans__panel">
        <div className="plans__header">
          <div className="plans__header-left">
            <svg
              className="plans__icon"
              viewBox="0 0 24 24"
              fill="currentColor"
              width="18"
              height="18"
            >
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
            </svg>
            <h3 className="plans__title">Plans</h3>
          </div>
          <button className="plans__close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {selectedPlan ? (
          <PlanDetail
            plan={selectedPlan}
            onBack={() => setSelectedPlan(null)}
            onUpdateStatus={handleUpdateStatus}
            onDelete={() => handleDeletePlan(selectedPlan.id)}
            onUpdate={(updates) => {
              setSelectedPlan((prev) =>
                prev ? { ...prev, ...updates, updatedAt: Date.now() } : null,
              )
              setPlans((prev) =>
                prev.map((p) =>
                  p.id === selectedPlan.id ? { ...p, ...updates, updatedAt: Date.now() } : p,
                ),
              )
            }}
            onNavigateToConversation={onNavigateToConversation}
          />
        ) : (
          <div className="plans__list-view">
            <div className="plans__actions">
              {conversationId && (
                <div className="plans__filter-toggle">
                  <button
                    className={`plans__filter-btn ${!filterCurrentTape ? 'plans__filter-btn--active' : ''}`}
                    onClick={() => setFilterCurrentTape(false)}
                  >
                    All
                  </button>
                  <button
                    className={`plans__filter-btn ${filterCurrentTape ? 'plans__filter-btn--active' : ''}`}
                    onClick={() => setFilterCurrentTape(true)}
                  >
                    This Tape
                  </button>
                </div>
              )}
              <button className="plans__new-btn" onClick={handleCreatePlan}>
                + New Plan
              </button>
            </div>

            <div className="plans__content">
              {loading && <div className="plans__loading">Loading plans...</div>}
              {error && <div className="plans__error">{error}</div>}

              {!loading && !error && plans.length === 0 && (
                <div className="plans__empty">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40" opacity={0.3}>
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                  </svg>
                  <p>No plans yet</p>
                  <span>Plans created during Claude Code sessions will appear here.</span>
                </div>
              )}

              {plans.map((plan) => (
                <button key={plan.id} className="plans__item" onClick={() => setSelectedPlan(plan)}>
                  <div className="plans__item-header">
                    <span className={`plans__status-dot plans__status-dot--${plan.status}`} />
                    <span className="plans__item-title">{plan.title}</span>
                  </div>
                  <div className="plans__item-meta">
                    <span className="plans__item-status">{STATUS_LABELS[plan.status]}</span>
                    {!filterCurrentTape && plan.conversationTitle && (
                      <span className="plans__item-tape" title={plan.conversationTitle}>
                        {plan.conversationTitle.split(/\s+/).slice(0, 3).join(' ')}
                      </span>
                    )}
                    <span className="plans__item-time">{formatTime(plan.updatedAt)}</span>
                  </div>
                  {plan.content && (
                    <div className="plans__item-preview">
                      {plan.content.slice(0, 120)}
                      {plan.content.length > 120 ? '...' : ''}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanDetail({
  plan,
  onBack,
  onUpdateStatus,
  onDelete,
  onUpdate,
  onNavigateToConversation,
}: {
  plan: api.Plan
  onBack: () => void
  onUpdateStatus: (plan: api.Plan, status: string) => void
  onDelete: () => void
  onUpdate: (updates: Partial<api.Plan>) => void
  onNavigateToConversation?: (id: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(plan.title)
  const [editContent, setEditContent] = useState(plan.content)

  const handleSave = async () => {
    try {
      await api.updatePlan(plan.id, {
        title: editTitle,
        content: editContent,
      })
      onUpdate({ title: editTitle, content: editContent })
      setIsEditing(false)
    } catch (err) {
      log.warn('Failed to save plan:', err)
    }
  }

  return (
    <div className="plans__detail">
      <div className="plans__detail-nav">
        <button className="plans__back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          All Plans
        </button>
        <div className="plans__detail-actions">
          {!isEditing && (
            <button className="plans__edit-btn" onClick={() => setIsEditing(true)}>
              Edit
            </button>
          )}
          <button className="plans__delete-btn" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="plans__editor">
          <input
            className="plans__editor-title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Plan title"
          />
          <textarea
            className="plans__editor-content"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="Write your plan here... Supports markdown."
          />
          <div className="plans__editor-actions">
            <button
              className="plans__cancel-btn"
              onClick={() => {
                setEditTitle(plan.title)
                setEditContent(plan.content)
                setIsEditing(false)
              }}
            >
              Cancel
            </button>
            <button className="plans__save-btn" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="plans__detail-content">
          <h2 className="plans__detail-title">{plan.title}</h2>

          <div className="plans__status-bar">
            <span className={`plans__status-dot plans__status-dot--${plan.status}`} />
            <select
              className="plans__status-select"
              value={plan.status}
              onChange={(e) => onUpdateStatus(plan, e.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {plan.conversationId && plan.conversationTitle && onNavigateToConversation && (
              <button
                className="plans__tape-link"
                onClick={() => onNavigateToConversation(plan.conversationId!)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                {plan.conversationTitle.split(/\s+/).slice(0, 4).join(' ')}
              </button>
            )}
          </div>

          {plan.content ? (
            <div className="plans__rendered-content">
              <MessageContent content={plan.content} />
            </div>
          ) : (
            <div className="plans__no-content">
              <p>No content yet. Click Edit to write a plan.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
