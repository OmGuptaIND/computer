import { motion } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'

interface Props {
  command: string
  reason: string
  onApprove: () => void
  onDeny: () => void
}

export function ConfirmDialog({ command, reason, onApprove, onDeny }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="confirm-dialog"
    >
      <div className="confirm-dialog__surface">
        <div className="confirm-dialog__header">
          <ShieldAlert className="confirm-dialog__icon" />
          <span className="confirm-dialog__title">Approval required</span>
        </div>

        <p className="confirm-dialog__reason">{reason}</p>

        <code className="confirm-dialog__command">{command}</code>

        <div className="confirm-dialog__actions">
          <button type="button" onClick={onDeny} className="button button--secondary">
            Cancel
          </button>
          <button type="button" onClick={onApprove} className="button button--primary">
            Approve
          </button>
        </div>
      </div>
    </motion.div>
  )
}
