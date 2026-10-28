/** Static hero signature from Main.dc.html (T-004 — motion optional later). */

export function HeroSignature() {
  return (
    <div className="lp-sig" data-hero-signature>
      <div className="lp-sig__pins">
        <div className="lp-sig__pin lp-sig__pin--active">
          <span className="lp-sig__pin-label">Support team agreed to</span>
          <span className="lp-sig__pin-text">Update the table to the new order</span>
          <span className="lp-sig__stamp is-active">
            <PlayIcon />
            03:15
          </span>
        </div>
        <div className="lp-sig__pin">
          <span className="lp-sig__pin-label">Deadline</span>
          <span className="lp-sig__pin-text">Furniture review within a month</span>
          <span className="lp-sig__stamp">
            <PlayIcon />
            12:01
          </span>
        </div>
      </div>

      <div className="lp-sig__lanes">
        <Lane name="Olena" tone={1} segments={["2% 20%", "24% 7%", "70% 26%"]} />
        <Lane
          name="Iryna"
          tone={2}
          segments={["33% 32%"]}
          evidence="32% 34%"
        />
        <Lane name="Maria" tone={3} segments={["9% 13%", "48% 18%", "82% 16%"]} />
        <span className="lp-sig__playhead" aria-hidden />
      </div>

      <div className="lp-sig__quote">
        <span className="dy-speaker">
          <span className="dy-speaker__dot sp-2" aria-hidden />
          Iryna
        </span>
        <p>
          <mark className="dy-mark">Okay, we&apos;ll update the table.</mark> Where
          will you send the order?
        </p>
      </div>
    </div>
  );
}

function Lane({
  name,
  tone,
  segments,
  evidence,
}: {
  name: string;
  tone: 1 | 2 | 3;
  segments: string[];
  evidence?: string;
}) {
  return (
    <div className="lp-sig__lane">
      <span className="lp-sig__lane-name">{name}</span>
      <div className="lp-sig__track">
        {evidence ? (
          <span
            className="lp-sig__evidence"
            style={{ left: evidence.split(" ")[0], width: evidence.split(" ")[1] }}
          />
        ) : null}
        {segments.map((seg) => {
          const [left, width] = seg.split(" ");
          return (
            <span
              key={seg}
              className={`lp-sig__seg sp-${tone}`}
              style={{ left, width }}
            />
          );
        })}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
      <path d="M4.5 2.8v10.4L13 8z" fill="currentColor" />
    </svg>
  );
}
