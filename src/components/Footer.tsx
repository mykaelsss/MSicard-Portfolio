import type { SiteContent } from "../lib/content";
import styles from "./Footer.module.css";

interface Props {
  content: SiteContent;
}

export default function Footer({ content }: Props) {
  return (
    <footer className={styles.footer}>
      <div className={`shell ${styles.inner}`}>
        <span className="mark">
          © {new Date().getFullYear()} {content.meta.name}
        </span>
        <span className={`mark num ${styles.coords}`}>
          {content.meta.location.lat.toFixed(4)}°,
          {content.meta.location.lon.toFixed(4)}°
        </span>
      </div>
    </footer>
  );
}
