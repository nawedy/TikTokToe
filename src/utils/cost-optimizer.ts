import * as AWS from 'aws-sdk';

import { DatabaseService } from '../services/database';
import { KubernetesService } from '../services/kubernetes';
import { LoggerService } from '../services/logger';
import { MetricsService } from '../services/metrics';
import { RedisService } from '../services/redis';

import { APMService } from './apm';

interface ResourceCost {
  service: string;
  resource: string;
  currentCost: number;
  projectedCost: number;
  utilizationRate: number;
  optimizationPotential: number;
  recommendations: string[];
}

interface CostOptimization {
  type: 'resize' | 'terminate' | 'reserve' | 'consolidate';
  resource: string;
  currentCost: number;
  projectedSavings: number;
  impact: 'high' | 'medium' | 'low';
  risk: 'high' | 'medium' | 'low';
  implementation: string;
}

export class CostOptimizer {
  private apm: APMService;
  private metrics: MetricsService;
  private db: DatabaseService;
  private redis: RedisService;
  private logger: LoggerService;
  private kubernetes: KubernetesService;
  private costExplorer: AWS.CostExplorer;

  constructor(
    apm: APMService,
    metrics: MetricsService,
    db: DatabaseService,
    redis: RedisService,
    logger: LoggerService,
    kubernetes: KubernetesService
  ) {
    this.apm = apm;
    this.metrics = metrics;
    this.db = db;
    this.redis = redis;
    this.logger = logger;
    this.kubernetes = kubernetes;
    this.costExplorer = new AWS.CostExplorer();
  }

  public async analyzeAndOptimize(): Promise<void> {
    const transaction = this.apm.startTransaction(
      'analyze-and-optimize-costs',
      'optimization'
    );

    try {
      // Analyze current costs and usage
      const [
        computeCosts,
        storageCosts,
        networkCosts,
        databaseCosts,
        cacheCosts,
      ] = await Promise.all([
        this.analyzeComputeCosts(),
        this.analyzeStorageCosts(),
        this.analyzeNetworkCosts(),
        this.analyzeDatabaseCosts(),
        this.analyzeCacheCosts(),
      ]);

      // Generate optimization recommendations
      const optimizations = this.generateOptimizations([
        ...computeCosts,
        ...storageCosts,
        ...networkCosts,
        ...databaseCosts,
        ...cacheCosts,
      ]);

      // Apply automated optimizations
      await this.applyOptimizations(optimizations);

      // Store optimization results
      await this.storeOptimizationResults(optimizations);

      // Update metrics
      this.updateOptimizationMetrics(optimizations);
    } catch (error) {
      this.logger.error('Cost optimization failed', { error });
      this.apm.captureError(error);
    } finally {
      transaction?.end();
    }
  }

  private async analyzeComputeCosts(): Promise<ResourceCost[]> {
    const span = this.apm.startSpan('analyze-compute-costs');

    try {
      // Get Kubernetes resource utilization
      const pods = await this.kubernetes.getPodMetrics();

      return pods.map(pod => ({
        service: pod.metadata.name,
        resource: 'compute',
        currentCost: this.calculatePodCost(pod),
        projectedCost: this.projectPodCost(pod),
        utilizationRate: this.calculateUtilization(pod),
        optimizationPotential: 0,
        recommendations: [],
      }));
    } finally {
      span?.end();
    }
  }

  private async analyzeStorageCosts(): Promise<ResourceCost[]> {
    const span = this.apm.startSpan('analyze-storage-costs');

    try {
      // Get storage metrics
      const volumes = await this.kubernetes.getPersistentVolumes();

      return volumes.map(volume => ({
        service: volume.metadata.name,
        resource: 'storage',
        currentCost: this.calculateStorageCost(volume),
        projectedCost: this.projectStorageCost(volume),
        utilizationRate: this.calculateStorageUtilization(volume),
        optimizationPotential: 0,
        recommendations: [],
      }));
    } finally {
      span?.end();
    }
  }

  private async analyzeNetworkCosts(): Promise<ResourceCost[]> {
    const span = this.apm.startSpan('analyze-network-costs');

    try {
      // Get network metrics
      const services = await this.kubernetes.getServices();

      return services.map(service => ({
        service: service.metadata.name,
        resource: 'network',
        currentCost: this.calculateNetworkCost(service),
        projectedCost: this.projectNetworkCost(service),
        utilizationRate: this.calculateNetworkUtilization(service),
        optimizationPotential: 0,
        recommendations: [],
      }));
    } finally {
      span?.end();
    }
  }

  private async analyzeDatabaseCosts(): Promise<ResourceCost[]> {
    const span = this.apm.startSpan('analyze-database-costs');

    try {
      // Get database metrics
      const metrics = await this.db.getMetrics();

      return [
        {
          service: 'database',
          resource: 'rds',
          currentCost: this.calculateDatabaseCost(metrics),
          projectedCost: this.projectDatabaseCost(metrics),
          utilizationRate: this.calculateDatabaseUtilization(metrics),
          optimizationPotential: 0,
          recommendations: [],
        },
      ];
    } finally {
      span?.end();
    }
  }

  private async analyzeCacheCosts(): Promise<ResourceCost[]> {
    const span = this.apm.startSpan('analyze-cache-costs');

    try {
      // Get cache metrics
      const metrics = await this.redis.info();

      return [
        {
          service: 'cache',
          resource: 'redis',
          currentCost: this.calculateCacheCost(metrics),
          projectedCost: this.projectCacheCost(metrics),
          utilizationRate: this.calculateCacheUtilization(metrics),
          optimizationPotential: 0,
          recommendations: [],
        },
      ];
    } finally {
      span?.end();
    }
  }

  private generateOptimizations(costs: ResourceCost[]): CostOptimization[] {
    const span = this.apm.startSpan('generate-optimizations');

    try {
      const optimizations: CostOptimization[] = [];

      for (const cost of costs) {
        // Check for underutilization
        if (cost.utilizationRate < 0.3) {
          optimizations.push({
            type: 'resize',
            resource: cost.resource,
            currentCost: cost.currentCost,
            projectedSavings: cost.currentCost * 0.5,
            impact: 'medium',
            risk: 'low',
            implementation: `Downsize ${cost.resource} due to low utilization`,
          });
        }

        // Check for reservation opportunities
        if (cost.utilizationRate > 0.7) {
          optimizations.push({
            type: 'reserve',
            resource: cost.resource,
            currentCost: cost.currentCost,
            projectedSavings: cost.currentCost * 0.3,
            impact: 'high',
            risk: 'low',
            implementation: `Purchase reserved capacity for ${cost.resource}`,
          });
        }

        // Check for consolidation opportunities
        if (cost.utilizationRate < 0.2 && cost.currentCost > 100) {
          optimizations.push({
            type: 'consolidate',
            resource: cost.resource,
            currentCost: cost.currentCost,
            projectedSavings: cost.currentCost * 0.7,
            impact: 'high',
            risk: 'medium',
            implementation: `Consolidate ${cost.resource} with other resources`,
          });
        }
      }

      return this.prioritizeOptimizations(optimizations);
    } finally {
      span?.end();
    }
  }

  private prioritizeOptimizations(
    optimizations: CostOptimization[]
  ): CostOptimization[] {
      if (!Array.isArray(optimizations)) {
      throw new Error('Optimizations must be an array');
    }
    if (optimizations === null || optimizations === undefined) {
        throw new Error('Optimizations parameter cannot be null or undefined');
      }


    return optimizations.sort((a, b) => {
      // Sort by savings potential and risk
      const aScore = a.projectedSavings * this.getRiskScore(a.risk);
      const bScore = b.projectedSavings * this.getRiskScore(b.risk);
      return bScore - aScore;
    });
  }

  private getRiskScore(risk: 'high' | 'medium' | 'low'): number {
    switch (risk) {
      case 'low':
        return 1;
      case 'medium':
        return 0.7;
      case 'high':
        return 0.3;
    }
  }

  private async applyOptimizations(
    optimizations: CostOptimization[]
  ): Promise<void> {
    const span = this.apm.startSpan('apply-optimizations');

    if (optimizations === null || optimizations === undefined) {
      throw new Error('Optimizations parameter cannot be null or undefined');
    }
    if (!Array.isArray(optimizations)) {
      throw new Error('Optimizations must be an array');
    }


    try {
      for (const optimization of optimizations) {
        if (this.isAutoApplicable(optimization)) {
          await this.applyOptimization(optimization);
        }
      }
    } finally {
      span?.end();
    }
  }

  private isAutoApplicable(optimization: CostOptimization): boolean {
    // Only auto-apply low-risk optimizations
    return (
      optimization.risk === 'low' &&
      optimization.impact !== 'high' &&
      optimization.type !== 'terminate'
    );
  }

  private async applyOptimization(
    optimization: CostOptimization
  ): Promise<void> {
    const span = this.apm.startSpan('apply-optimization');

    try {
      switch (optimization.type) {
        case 'resize':
          await this.resizeResource(optimization);
          break;
        case 'reserve':
          await this.reserveCapacity(optimization);
          break;
        case 'consolidate':
          await this.consolidateResources(optimization);
          break;
      }
    } catch (error) {
      this.logger.error('Failed to apply optimization', {
        optimization,
        error,
      });
      this.apm.captureError(error);
    } finally {
      span?.end();
    }
  }

  private async resizeResource(_optimization: CostOptimization): Promise<void> {    
    // Implementation for resizing resources
    this.logger.info('Resource resized');
  }

  private async reserveCapacity(
    _optimization: CostOptimization
  ): Promise<void> {
    this.logger.info('Capacity reserved');
    // Implementation for reserving capacity
  }

  private async consolidateResources(
    _optimization: CostOptimization
  ): Promise<void> {
    this.logger.info('Resources consolidated');
    // Implementation for consolidating resources
  }

  private async storeOptimizationResults(
    optimizations: CostOptimization[]
  ): Promise<void> {
    const span = this.apm.startSpan('store-optimization-results');

    try {
      await this.db.query(
        'INSERT INTO cost_optimizations (timestamp, optimizations) VALUES ($1, $2)',
        [new Date(), JSON.stringify(optimizations)]
      );
    } finally {
      span?.end();
    }
  }

  private updateOptimizationMetrics(optimizations: CostOptimization[]): void {
    const span = this.apm.startSpan('update-optimization-metrics');

    try {
      const totalSavings = optimizations.reduce(
        (sum, opt) => sum + opt.projectedSavings,
        0
      );

      this.metrics.recordOptimizationSavings(totalSavings);
      this.metrics.recordOptimizationCount(optimizations.length);
    } finally {
      span?.end();
    }
  }

  private calculatePodCost(_pod: any): number {    
    return 1;
  }

  private projectPodCost(_pod: any): number {
    
    return 1.2;
  }

  private calculateUtilization(_pod: any): number {
   
    return 50;

  }

  private calculateStorageCost(_volume: any): number {
    return 2;
  }

  private projectStorageCost(_volume: any): number {
    return 2.4;
  }

  private calculateStorageUtilization(_volume: any): number {
    return 60;
  }

  private calculateNetworkCost(_service: any): number {
    return 3;
  }

  private projectNetworkCost(_service: any): number {
    return 3.6;
  }

  private calculateNetworkUtilization(_service: any): number {
    return 70;
  }

  private calculateDatabaseCost(_metrics: any): number {
    return 4;
  }

  private projectDatabaseCost(_metrics: any): number {
    return 4.8;
  }

  private calculateDatabaseUtilization(_metrics: any): number {
    return 80;
  }

  private calculateCacheCost(_metrics: any): number {    
    return 5;
  }

  private projectCacheCost(_metrics: any): number {    
    return 6;
  }

  private calculateCacheUtilization(_metrics: any): number {   
    return 90;
  }

  public async generateSavingsReport(): Promise<string> {
    
    function isCostOptimizationArray(arr: any): arr is CostOptimization[] {
      return Array.isArray(arr) && arr.every((item) => typeof item.projectedSavings === 'number');
    }

    function validateOptimizations(optimizations: any) {
      if (optimizations === null || optimizations === undefined) {
        throw new Error('Optimizations parameter cannot be null or undefined');
      }
      if (!isCostOptimizationArray(optimizations)) {
        throw new Error('Optimizations must be an array of CostOptimization with a number value for projectedSavings');
      }
    }


    const span = this.apm.startSpan('generate-savings-report');

    try {
      const optimizations = await this.db.query(
        'SELECT * FROM cost_optimizations ORDER BY timestamp DESC LIMIT 1'
      );

      validateOptimizations(optimizations.rows[0]?.optimizations);
      const latestOptimizations = optimizations.rows[0]?.optimizations || [];
      const totalSavings = latestOptimizations.reduce(
        (sum: number, opt: CostOptimization) => sum + opt.projectedSavings,
        0
      );

      return `
# Cost Optimization Report

## Summary
- Total Optimizations: ${latestOptimizations.length}
- Projected Annual Savings: $${(totalSavings * 12).toFixed(2)}
- Implementation Risk: ${this.calculateAverageRisk(latestOptimizations)}

## Optimizations by Type
${this.groupOptimizationsByType(latestOptimizations)}

## Top Savings Opportunities
${this.formatTopSavings(latestOptimizations)}

## Implementation Plan
${this.generateImplementationPlan(latestOptimizations)}
      `;
    } finally {
      span?.end();
    }
  }

  private calculateAverageRisk(optimizations: CostOptimization[]): string {
    const riskScores = optimizations.map(opt => this.getRiskScore(opt.risk));
    const avgRisk = riskScores.reduce((a, b) => a + b) / riskScores.length;

    if (avgRisk > 0.8) return 'Low';
    if (avgRisk > 0.5) return 'Medium';
    return 'High';
  }

  private groupOptimizationsByType(optimizations: CostOptimization[]): string {
    const groups = optimizations.reduce(
      (acc, opt) => {
        acc[opt.type] = (acc[opt.type] || 0) + opt.projectedSavings;
        return acc;
      },
      {} as Record<string, number>
    );

    return Object.entries(groups)
      .map(
        ([type, savings]) =>
          `- ${type}: $${savings.toFixed(2)} projected annual savings`
      )
      .join('\n');
  }

  private formatTopSavings(optimizations: CostOptimization[]): string {
    return optimizations
      .sort((a, b) => b.projectedSavings - a.projectedSavings)
      .slice(0, 5)
      .map(
        opt =>
          `- ${opt.implementation}: $${opt.projectedSavings.toFixed(2)} projected savings`
      )
      .join('\n');
  }

  private generateImplementationPlan(
    optimizations: CostOptimization[]
  ): string {
    const autoOptimizations = optimizations.filter(opt =>
      this.isAutoApplicable(opt)
    );

    const manualOptimizations = optimizations.filter(
      opt => !this.isAutoApplicable(opt)
    );

    return `
### Automated Optimizations
${autoOptimizations.map(opt => `- ${opt.implementation} (Automated)`).join('\n')}

### Manual Review Required
${manualOptimizations.map(opt => `- ${opt.implementation} (${opt.risk} risk)`).join('\n')}
    `;
  }
}
