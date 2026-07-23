import styles from '../App.module.css';

type StatusTone = 'neutral' | 'ready' | 'attention';

interface StatusPillProps {
    label: string;
    tone?: StatusTone;
}

function StatusPill(props: StatusPillProps) {
    const { label, tone = 'neutral' } = props;

    return (
        <span className={styles.statusPill} data-tone={tone}>
            {label}
        </span>
    );
}

export default StatusPill;
