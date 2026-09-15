import type { SocialProvider } from "../api";
import Google from "../svgs/google";
import Github from "../svgs/github";

export interface SocialButtonsProps {
  loading: boolean;
  providers?: SocialProvider[];
  onSelect: (provider: SocialProvider) => void;
}

export function SocialButtons({ loading, providers = ["google", "github"], onSelect }: SocialButtonsProps): React.JSX.Element {
  return (
    <div className="pp-form-group">
      {providers.includes("google") && (
        <button
          type="button"
          disabled={loading}
          onClick={() => onSelect("google")}
          className="pp-social-btn"
        >
          <Google />
          <span>Continue with Google</span>
        </button>
      )}
      {providers.includes("github") && (
        <button
          type="button"
          disabled={loading}
          onClick={() => onSelect("github")}
          className="pp-social-btn"
        >
          <Github />
          <span>Continue with GitHub</span>
        </button>
      )}
    </div>
  );
}
