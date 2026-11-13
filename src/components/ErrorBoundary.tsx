import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Turns a render crash into something readable.
 *
 * A packaged WebView shows a blank white screen when React throws, which tells
 * you nothing. This renders the message and the stack instead, in the app's own
 * visual language, so a failure on a phone is diagnosable without a debugger.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Aureline] render error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-content-center px-6 py-16">
        <div className="mx-auto max-w-lg rounded-card border border-gold-400/25 bg-ink-850/80 p-8 shadow-gold">
          <p className="eyebrow">Startup error</p>
          <h1 className="mt-4 font-display text-2xl text-white">
            Aureline couldn&apos;t start.
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-muted/75">
            Something threw before the interface could render. The details below are the
            actual error — send them on and it can be fixed precisely.
          </p>
          <pre className="mt-5 max-h-56 overflow-auto rounded-xl border border-white/[0.08] bg-ink-950/70 p-4 text-[11px] leading-relaxed text-gold-100/85">
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-gold mt-6"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
