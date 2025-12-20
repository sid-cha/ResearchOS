import { Statement } from '../types';

interface Props {
    statements: Statement[];
}

export default function StatementsTable({ statements }: Props) {
    if (!statements || statements.length === 0) {
        return <div className="p-4 text-gray-500">No statements available for this company.</div>;
    }

    // Sort statements by year/period descending
    const sortedStmts = [...statements].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return 0; // Simplified period sort
    });

    // Get all unique line items to build rows
    const lineItemNames = Array.from(new Set(statements.flatMap(s => s.lines.map(l => l.lineItem))));

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                            Line Item
                        </th>
                        {sortedStmts.map(stmt => (
                            <th key={stmt.id} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">
                                {stmt.year} {stmt.period} ({stmt.type.replace('_', ' ')})
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                    {lineItemNames.map(item => (
                        <tr key={item}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                {item}
                            </td>
                            {sortedStmts.map(stmt => {
                                const line = stmt.lines.find(l => l.lineItem === item);
                                return (
                                    <td key={`${stmt.id}-${item}`} className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                                        {line ? line.value.toLocaleString() : '-'}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
