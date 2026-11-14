import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Zap, ArrowRight, X } from 'lucide-react';
import type { AccessResult } from '../context/SubscriptionContext';
import { FREE_USES_LIMIT } from '../context/SubscriptionContext';

interface GateModalProps {
  reason: AccessResult | null;
  onClose: () => void;
  toolName?: string;
}

const GateModal = ({ reason, onClose, toolName }: GateModalProps) => {
  const navigate = useNavigate();

  if (!reason || reason === 'allowed') return null;

  const handleUpgrade = (plan?: 'pro') => {
    onClose();
    navigate(`/dashboard/subscription${plan ? `?highlight=${plan}` : ''}`);
  };

  // ── Config per reason ──────────────────────────────────────────────────────
  const configs = {
    free_exhausted: {
      icon: <Lock size={28} color="var(--primary)" />,
      iconBg: 'var(--primary-subtle)',
      title: 'Free Limit Reached',
      body: `You've used all ${FREE_USES_LIMIT} free tries.${toolName ? ` Upgrade to continue using ${toolName} and all other tools.` : ' Upgrade to continue using premium tools.'}`,
      badge: null,
      actions: [
        {
          label: '⚡ Upgrade to PRO — ₹29/mo',
          onClick: () => handleUpgrade('pro'),
          primary: true,
          color: 'var(--primary)',
        },
      ],
      note: 'Cancel anytime · All processing stays on your device',
    },
    needs_pro: {
      icon: <Zap size={28} color="var(--primary)" />,
      iconBg: 'var(--primary-subtle)',
      title: 'PRO Required',
      body: `${toolName ? `"${toolName}"` : 'This tool'} is available on the PRO plan and above. Upgrade to unlock unlimited access to AI tools, PDF editing, OCR, and more.`,
      badge: 'PRO',
      badgeColor: 'var(--primary)',
      actions: [
        {
          label: '⚡ Upgrade to PRO — ₹29/mo',
          onClick: () => handleUpgrade('pro'),
          primary: true,
          color: 'var(--primary)',
        },
      ],
      note: 'Pro includes 11 tool categories · unlimited usage',
    },
  };

  const cfg = configs[reason as keyof typeof configs];
  if (!cfg) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9500, padding: '16px',
          backdropFilter: 'blur(4px)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 16 }}
          transition={{ type: 'spring', damping: 20, stiffness: 320 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--card-bg)',
            borderRadius: '24px',
            padding: '36px',
            maxWidth: '440px',
            width: '100%',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border-color)',
            position: 'relative',
          }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'var(--hover-bg)', border: 'none',
              borderRadius: '8px', width: '30px', height: '30px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)',
            }}
          >
            <X size={16} />
          </button>

          {/* Icon + Badge */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '20px' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '16px',
              background: cfg.iconBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {cfg.icon}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
                  {cfg.title}
                </h2>
                {'badge' in cfg && cfg.badge && (
                  <span style={{
                    fontSize: '12px', fontWeight: 800,
                    background: (cfg as typeof configs.needs_pro).badgeColor,
                    color: 'var(--on-accent)', padding: '2px 8px',
                    borderRadius: '9999px', letterSpacing: '0.5px',
                  }}>
                    {cfg.badge}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          <p style={{
            fontSize: '14px', color: 'var(--text-secondary)',
            lineHeight: 1.65, marginBottom: '28px',
          }}>
            {cfg.body}
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
            {cfg.actions.map((action, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={action.onClick}
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'opacity 0.15s',
                  ...(action.primary
                    ? { background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }
                    : { background: 'transparent', color: action.color, border: `1.5px solid ${action.color}` }
                  ),
                }}
              >
                {action.label}
                {action.primary && <ArrowRight size={15} />}
              </motion.button>
            ))}

            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '12px',
                background: 'var(--hover-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px', color: 'var(--text-secondary)',
                fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              Maybe Later
            </button>
          </div>

          {/* Note */}
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
            {cfg.note}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default GateModal;
