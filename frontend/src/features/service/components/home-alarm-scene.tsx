import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./service-home.module.css";

export function HomeAlarmScene({ children, ringing }: { children: ReactNode; ringing: boolean }) {
  return (
    <div className={styles.scene} data-ringing={ringing || undefined}>
      {children}
      <div className={styles.room} aria-hidden="true">
        <Image src="/brand/morning-room.png" alt="" fill sizes="430px" className={styles.roomImage} priority />
        <span className={styles.clockShadow} />
        <Image src="/brand/marshmallow-alarm-bright.png" alt="" width={1215} height={1295} sizes="260px" className={styles.clockArtwork} priority />
      </div>
    </div>
  );
}

export function SetupGuidanceScene({
  description,
  href,
  label,
  title,
}: {
  description: string;
  href: string;
  label: string;
  title: string;
}) {
  return (
    <HomeAlarmScene ringing={false}>
      <section className={`${styles.bubble} ${styles.guideBubble}`}>
        <div className={styles.bubbleStatus}>
          <span className={styles.statusDot} />
          <span>첫 기상 계획 준비</span>
        </div>
        <h2 className={styles.bubbleTitle}>{title}</h2>
        <p className={styles.guideCopy}>{description}</p>
        <Link className="service-primary" href={href}>
          {label}
        </Link>
      </section>
    </HomeAlarmScene>
  );
}
