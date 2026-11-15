import { getCompany, getStatements, getMetrics } from '@/services/api';
import StatementsTable from '@/components/StatementsTable';
import MetricsGrid from '@/components/MetricsGrid';

export default async function CompanyPage({ params }: { params: { ticker: string } }) {
    const ticker = params.ticker;
    let company, statements, metrics;
    let error = null;

    try {
        company = await getCompany(ticker);
        statements = await getStatements(ticker);
        metrics = await getMetrics(ticker);
    } catch (e) {
        console.error(e);
        error = "Could not fetch company data. Ensure backend is running.";
    }

    if (error || !company) {
        return (
            <div className="min-h-screen p-24">
                <h1 className="text-4xl font-bold mb-4">{ticker}</h1>
                <div className="p-4 bg-red-100 text-red-700 rounded border border-red-300">
                    {error || "Company not found"}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8 bg-gray-50 dark:bg-black">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <header className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{company.name}</h1>
                            <div className="flex items-center space-x-2 mt-2">
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">{company.ticker}</span>
                                <span className="text-gray-500">•</span>
                                <span className="text-gray-600 dark:text-gray-400">{company.industry}</span>
                            </div>
                        </div>

                    </div>
                    <p className="mt-4 text-gray-600 dark:text-gray-300 max-w-3xl">{company.description}</p>
                </header>

                {/* content */}
                <div className="space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold mb-3">Key Metrics</h2>
                        <MetricsGrid metrics={metrics} />
                    </section>

                    <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                            <h2 className="text-xl font-semibold">Financial Statements</h2>
                        </div>
                        <StatementsTable statements={statements} />
                    </section>
                </div>
            </div>
        </div>
    );
}
