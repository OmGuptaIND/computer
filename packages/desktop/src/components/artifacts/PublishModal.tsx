import { AnimatePresence, motion } from 'framer-motion'
import { Check, Code2, Copy, Globe, Linkedin, Share2, Twitter } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { artifactStore } from '../../lib/store/artifactStore.js'
import { Modal } from '../ui/Modal.js'

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'untitled'
  )
}

export function PublishModal() {
  const open = artifactStore((s) => s.publishModalOpen)
  const artifactId = artifactStore((s) => s.publishModalArtifactId)
  const artifacts = artifactStore((s) => s.artifacts)
  const closeModal = artifactStore((s) => s.closePublishModal)
  const publishError = artifactStore((s) => s.publishError)

  const artifact = artifacts.find((a) => a.id === artifactId) ?? null

  const defaultTitle = artifact?.title || artifact?.filename || 'Untitled'

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  // Reset state when modal opens with a new artifact
  useEffect(() => {
    if (open) {
      setName(defaultTitle)
      setSlug(slugify(defaultTitle))
      setSlugEdited(false)
      setPublishing(false)
      setPublished(false)
      setCopiedLink(false)
      setCopiedEmbed(false)
    }
  }, [open, defaultTitle])

  // Watch for publish success
  useEffect(() => {
    if (publishing && artifact?.publishedUrl) {
      setPublishing(false)
      setPublished(true)
    }
  }, [publishing, artifact?.publishedUrl])

  // Watch for publish error — stop spinner so user can fix slug
  useEffect(() => {
    if (publishing && publishError) {
      setPublishing(false)
    }
  }, [publishing, publishError])

  // Derive slug from name unless manually edited
  useEffect(() => {
    if (!slugEdited) {
      setSlug(slugify(name))
      if (publishError) artifactStore.getState().setPublishError(null)
    }
  }, [name, slugEdited, publishError])

  const publicUrl = artifact?.publishedUrl || ''

  const handlePublish = useCallback(() => {
    if (!artifact || publishing) return
    setPublishing(true)
    artifactStore
      .getState()
      .publishArtifact(
        artifact.id,
        artifact.content,
        artifact.renderType,
        name || 'Untitled',
        artifact.projectId,
        slug,
      )
  }, [artifact, publishing, name, slug])

  const handleCopyLink = useCallback(() => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }, [publicUrl])

  const embedCode = useMemo(
    () => `<iframe src="${publicUrl}" width="100%" height="600" frameborder="0"></iframe>`,
    [publicUrl],
  )

  const handleCopyEmbed = useCallback(() => {
    navigator.clipboard.writeText(embedCode)
    setCopiedEmbed(true)
    setTimeout(() => setCopiedEmbed(false), 2000)
  }, [embedCode])

  const handleClose = useCallback(() => {
    closeModal()
  }, [closeModal])

  if (!artifact) return null

  return (
    <Modal open={open} onClose={handleClose} title={published ? 'Published' : 'Publish'}>
      <AnimatePresence mode="wait">
        {!published ? (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="publish-modal"
          >
            <label className="publish-modal__label">
              <span className="publish-modal__label-text">Name</span>
              <input
                type="text"
                className="publish-modal__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Page title"
              />
            </label>

            <label className="publish-modal__label">
              <span className="publish-modal__label-text">Slug</span>
              <input
                type="text"
                className="publish-modal__input publish-modal__input--mono"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))
                  setSlugEdited(true)
                  if (publishError) artifactStore.getState().setPublishError(null)
                }}
                placeholder="url-slug"
              />
            </label>

            <div className="publish-modal__preview-url">
              <Globe size={12} strokeWidth={1.5} />
              <span className="publish-modal__url-text">/a/{slug || '...'}</span>
            </div>

            <div className="publish-modal__type-badge">
              <Code2 size={12} strokeWidth={1.5} />
              <span>{artifact.renderType}</span>
            </div>

            {publishError && (
              <div className="publish-modal__error">{publishError}</div>
            )}

            <button
              type="button"
              className="publish-modal__btn publish-modal__btn--primary"
              onClick={handlePublish}
              disabled={publishing || !slug}
            >
              <Globe size={14} strokeWidth={1.5} />
              <span>{publishing ? 'Publishing...' : 'Publish'}</span>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="publish-modal"
          >
            <div className="publish-modal__success">
              <div className="publish-modal__success-icon">
                <Check size={18} strokeWidth={1.5} />
              </div>
              <span>Your page is live</span>
            </div>

            <div className="publish-modal__url-display">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="publish-modal__url-link"
              >
                {publicUrl}
              </a>
              <button type="button" className="publish-modal__copy-btn" onClick={handleCopyLink}>
                {copiedLink ? (
                  <Check size={14} strokeWidth={1.5} />
                ) : (
                  <Copy size={14} strokeWidth={1.5} />
                )}
              </button>
            </div>

            <div className="publish-modal__share-row">
              <button type="button" className="publish-modal__share-btn" onClick={handleCopyLink}>
                {copiedLink ? (
                  <Check size={14} strokeWidth={1.5} />
                ) : (
                  <Copy size={14} strokeWidth={1.5} />
                )}
                <span>{copiedLink ? 'Copied' : 'Copy link'}</span>
              </button>

              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="publish-modal__share-btn"
              >
                <Twitter size={14} strokeWidth={1.5} />
                <span>Twitter</span>
              </a>

              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="publish-modal__share-btn"
              >
                <Linkedin size={14} strokeWidth={1.5} />
                <span>LinkedIn</span>
              </a>

              <button type="button" className="publish-modal__share-btn" onClick={handleCopyEmbed}>
                {copiedEmbed ? (
                  <Check size={14} strokeWidth={1.5} />
                ) : (
                  <Share2 size={14} strokeWidth={1.5} />
                )}
                <span>{copiedEmbed ? 'Copied' : 'Embed'}</span>
              </button>
            </div>

            <button
              type="button"
              className="publish-modal__btn publish-modal__btn--secondary"
              onClick={handleClose}
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
