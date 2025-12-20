import { Company, Statement, MetricValue } from '../types';

const API_BASE_URL = 'http://localhost:8080/api';

export async function getCompany(ticker: string): Promise<Company> {
    const res = await fetch(`${API_BASE_URL}/companies/${ticker}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch company');
    return res.json();
}

export async function getStatements(ticker: string): Promise<Statement[]> {
    const res = await fetch(`${API_BASE_URL}/statements/${ticker}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch statements');
    return res.json();
}

export async function getMetrics(ticker: string): Promise<MetricValue[]> {
    const res = await fetch(`${API_BASE_URL}/metrics/${ticker}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return res.json();
}
