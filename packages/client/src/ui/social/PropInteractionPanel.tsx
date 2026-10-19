import { useState } from "react";
import {
  canonicalEmbedUrl,
  isValidPropInteraction,
  type PropInteraction,
  type RoomLayoutProp,
} from "@gammyverse/shared";

export function PropInteractionEditor({
  prop,
  onChange,
}: {
  prop: RoomLayoutProp;
  onChange(interaction: PropInteraction | undefined): void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [interaction, setInteraction] = useState(prop.interaction);
  const update = (value: PropInteraction) => {
    setInteraction(value);
    onChange(value);
    if (!isValidPropInteraction(value)) {
      setError("Use a title and a safe HTTPS URL or note.");
      return;
    }
    setError(null);
  };
  return (
    <fieldset className="modify-props-interaction">
      <legend>Interaction settings</legend>
      <label className="modify-props-interaction-kind">
        Type
      <select
        aria-label="Interaction kind"
        value={interaction?.kind ?? ""}
        onChange={(event) => {
          if (!event.target.value) {
            setInteraction(undefined);
            onChange(undefined);
          } else
            update({
              kind: event.target.value as PropInteraction["kind"],
              title: "Interaction",
              ...(event.target.value === "note"
                ? { text: "" }
                : { url: "https://example.com/" }),
            });
        }}
      >
        <option value="">None</option>
        <option value="link">Link</option>
        <option value="note">Note</option>
        <option value="embed">Embed / whiteboard</option>
      </select>
      </label>
      {interaction && (
        <div className="modify-props-interaction-fields">
          <label>
            <span>Title</span>
            <input
              value={interaction.title}
              onChange={(event) =>
                update({ ...interaction, title: event.target.value })
              }
            />
          </label>
          {interaction.kind === "note" ? (
            <label>
              <span>Note</span>
              <textarea
                value={interaction.text ?? ""}
                onChange={(event) =>
                  update({ ...interaction, text: event.target.value })
                }
              />
            </label>
          ) : (
            <label>
              <span>HTTPS URL</span>
              <input
                value={interaction.url ?? ""}
                onChange={(event) =>
                  update({ ...interaction, url: event.target.value })
                }
              />
            </label>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}

export function PropInteractionModal({
  interaction,
  onClose,
}: {
  interaction: PropInteraction;
  onClose(): void;
}) {
  const canonical =
    interaction.kind === "embed" && interaction.url
      ? canonicalEmbedUrl(interaction.url)
      : null;
  const hostname = interaction.url ? new URL(interaction.url).hostname : null;
  return (
    <div className="gather-modal-backdrop">
      <section
        className="gather-interaction"
        role="dialog"
        aria-modal="true"
        aria-label={interaction.title}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2>{interaction.title}</h2>
        <button autoFocus type="button" onClick={onClose}>
          Close
        </button>
        {interaction.kind === "note" && (
          <p style={{ whiteSpace: "pre-wrap" }}>{interaction.text}</p>
        )}
        {hostname && (
          <p>
            Destination: <strong>{hostname}</strong>
          </p>
        )}
        {canonical && (
          <iframe
            title={interaction.title}
            src={canonical}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        )}
        {interaction.url && (
          <a href={interaction.url} target="_blank" rel="noopener noreferrer">
            Open in new tab ({hostname})
          </a>
        )}
      </section>
    </div>
  );
}
