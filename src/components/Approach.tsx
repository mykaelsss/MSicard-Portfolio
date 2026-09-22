import Section from "./Section";
import { normalizeSkill, type SiteContent } from "../lib/content";
import styles from "./Approach.module.css";

interface Props {
  content: SiteContent;
}

export default function Approach({ content }: Props) {
  const current = content.experience.find((role) => role.current);
  const languages = content.skills.find((g) => g.group === "Languages");
  const databases = content.skills.find((g) => g.group === "Databases");

  /* A skill is either a bare name or a name with the builds it shipped in.
     Only the name belongs in a one-line fact. */
  const nameAt = (group: typeof languages, index: number) => {
    const item = group?.items[index];
    return item ? normalizeSkill(item).name : null;
  };

  const facts = [
    {
      label: "Based",
      value: `${content.meta.location.city}, ${content.meta.location.region}`,
    },
    current ? { label: "Now", value: current.org } : null,
    {
      label: "Core",
      value: [nameAt(languages, 0), nameAt(languages, 2), nameAt(databases, 0)]
        .filter(Boolean)
        .join(", "),
    },
  ].filter((f): f is { label: string; value: string } => Boolean(f));

  return (
    <Section id="approach" title="The approach">
      <div className={styles.grid}>
        <p className={`initial ${styles.statement}`} data-reveal="up">
          {content.summary}
        </p>

        <dl className={styles.facts} data-reveal="stagger">
          {facts.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt className="mark">{fact.label}</dt>
              <dd className={styles.factValue}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
