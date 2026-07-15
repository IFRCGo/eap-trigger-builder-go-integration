import { Description, Heading } from '@ifrc-go/ui';

import styles from '../App.module.css';

interface MetricCardProps {
    label: string;
    value: string;
    hint: string;
}

function MetricCard(props: MetricCardProps) {
    const { hint, label, value } = props;

    return (
        <article className={styles.summaryCard}>
            <Description className={styles.summaryLabel} textSize="xs">
                {label}
            </Description>
            <Heading className={styles.summaryValue} level={4}>
                {value}
            </Heading>
            <Description className={styles.summaryHint} textSize="sm">
                {hint}
            </Description>
        </article>
    );
}

export default MetricCard;
