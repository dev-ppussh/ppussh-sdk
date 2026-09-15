import { Mail } from "lucide-react";

export interface NoticeCardProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  email?: string;
}

export function NoticeCard({ title, message, actionLabel, onAction, email }: NoticeCardProps): React.JSX.Element {
  return (
    <div className="pp-notice">
      <div className="pp-notice-icon">
        <Mail />
      </div>
      <h2 className="pp-notice-title">{title}</h2>
      <p className="pp-notice-message">
        {email ? (
          <>
            {message} <span className="pp-notice-highlight">{email}</span>.
          </>
        ) : (
          message
        )}
      </p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="pp-btn pp-btn-primary">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
