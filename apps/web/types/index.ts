export interface Company {
    ticker: string;
    name: string;
    description: string;
    industry: string;
}

export interface StatementLine {
    id: string;
    lineItem: string;
    value: number;
    displayOrder: number;
}

export interface Statement {
    id: string;
    companyTicker: string;
    type: string;
    period: string;
    year: number;
    date: string;
    lines: StatementLine[];
}

export interface MetricValue {
    id: string;
    metricCode: string;
    companyTicker: string;
    date: string;
    value: number;
}
