import { MetricValue } from '../types';

interface Props {
    metrics: MetricValue[];
}

export default function MetricsGrid({ metrics }: Props) {
    if (!metrics || metrics.length === 0) {
        return <div className="p-4 text-gray-500">No metrics calculated.</div>;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
            {metrics.map(m => (
                <div key={m.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 uppercase">{m.metricCode.replace('_', ' ')}</div>
                    <div className="text-2xl font-bold flex items-baseline">
                        {m.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        {m.metricCode.includes('MARGIN') || m.metricCode.includes('PERCENT') ? '%' : ''}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{m.date}</div>
                </div>
            ))}
        </div>
    );
}
