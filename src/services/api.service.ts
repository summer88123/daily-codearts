import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  ApiResponse,
  CachedToken,
  HuaweiCloudConfig,
  IamTokenRequest,
  IamTokenResponse,
  ListIssuesV4Request,
  ListIssuesV4Response,
  ListProjectIterationsV4Request,
  ListProjectIterationsV4Response,
  ProjectListResponse,
  ProjectMemberListResponse,
  ProjectMemberQueryParams,
  ProjectQueryParams,
  RequestOptions,
  ShowProjectWorkHoursRequest,
  ShowProjectWorkHoursResponse,
} from '../types';

/**
 * 华为云CodeArts API服务类
 * 支持IAM Token认证和CodeArts API调用
 */
export class ApiService {
  private client: AxiosInstance;
  private iamClient: AxiosInstance;
  private config: HuaweiCloudConfig;
  private cachedToken: CachedToken | null = null;
  private enableLogging: boolean;

  constructor(config: HuaweiCloudConfig) {
    this.config = {
      ...config,
    };
    this.enableLogging = config.enableLogging ?? false;

    // 初始化IAM客户端（用于获取Token）
    this.iamClient = axios.create({
      baseURL: this.config.iamEndpoint,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 初始化主客户端（用于调用CodeArts API）
    this.client = axios.create({
      baseURL: this.config.endpoint,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * 打印curl风格的请求日志
   */
  private logCurlRequest(config: AxiosRequestConfig, clientType: string = 'CodeArts'): void {
    if (!this.enableLogging) {
      return;
    }

    const baseUrl = config.baseURL || '';
    const url = config.url?.startsWith('http') ? config.url : `${baseUrl}${config.url}`;
    const method = (config.method || 'GET').toUpperCase();

    let curlCmd = `curl -X ${method}`;

    // 添加请求头
    if (config.headers && typeof config.headers === 'object') {
      Object.entries(config.headers).forEach(([key, value]) => {
        if (value && typeof value === 'string') {
          // 对敏感信息进行脱敏处理
          let headerValue = value;
          if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
            headerValue = value.length > 8 ? `${value.substring(0, 8)}...` : '***';
          }
          curlCmd += ` \\\n  -H "${key}: ${headerValue}"`;
        }
      });
    }

    // 添加查询参数
    let finalUrl = url;
    if (config.params && Object.keys(config.params).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        const separator = url.includes('?') ? '&' : '?';
        finalUrl = `${url}${separator}${queryString}`;
      }
    }

    curlCmd += ` \\\n  "${finalUrl}"`;

    // 添加请求体
    if (config.data) {
      let dataStr = '';
      if (typeof config.data === 'string') {
        dataStr = config.data;
      } else if (typeof config.data === 'object') {
        dataStr = JSON.stringify(config.data, null, 2);
      }

      // 如果数据太长，进行截断显示
      if (dataStr.length > 500) {
        const truncated = dataStr.substring(0, 500);
        curlCmd += ` \\\n  -d '${truncated}...'`;
      } else {
        curlCmd += ` \\\n  -d '${dataStr}'`;
      }
    }

    const emoji = clientType === 'IAM' ? '🔐' : '🔄';
    console.log(`\n${emoji} ${clientType}请求 [${method}]:`);
    console.log(curlCmd);
    console.log('');
  }

  /**
   * 设置请求和响应拦截器
   */
  private setupInterceptors(): void {
    // IAM客户端拦截器
    this.iamClient.interceptors.request.use(
      (config) => {
        // 打印curl风格的IAM请求日志
        this.logCurlRequest(config, 'IAM');
        return config;
      },
      (error) => {
        console.error('IAM请求错误:', error);
        return Promise.reject(error);
      }
    );

    this.iamClient.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (this.enableLogging) {
          console.error('IAM响应错误:', error.response?.data || error.message);
        }
        return Promise.reject(error);
      }
    );

    // 主客户端拦截器
    this.client.interceptors.request.use(
      async (config) => {
        // 自动添加Token到请求头
        const token = await this.getValidToken();
        if (token) {
          config.headers['X-Auth-Token'] = token;
        }

        // 添加项目ID到请求头（如果有）
        if (this.cachedToken?.projectId) {
          config.headers['X-Project-Id'] = this.cachedToken.projectId;
        }

        // 打印curl风格的请求日志
        this.logCurlRequest(config);
        return config;
      },
      (error) => {
        console.error('CodeArts请求错误:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // 如果是401错误且没有重试过，尝试刷新Token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            this.cachedToken = null; // 清除缓存的Token
            const newToken = await this.getValidToken();

            if (newToken) {
              originalRequest.headers['X-Auth-Token'] = newToken;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            console.error('刷新Token失败:', refreshError);
          }
        }

        console.error('CodeArts响应错误:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * 获取IAM Token
   */
  private async getIamToken(): Promise<CachedToken> {
    const requestBody: IamTokenRequest = {
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              name: this.config.username,
              password: this.config.password,
              domain: {
                name: this.config.domainName,
              },
            },
          },
        },
        scope: {
          domain: {
            name: this.config.domainName,
          },
        },
      },
    };

    try {
      const response = await this.iamClient.post<IamTokenResponse>('/v3/auth/tokens', requestBody);

      const token = response.headers['x-subject-token'];
      if (!token) {
        throw new Error('未能从响应头获取到Token');
      }

      const tokenData = response.data.token;
      const expiresAt = new Date(tokenData.expires_at);
      const issuedAt = new Date(tokenData.issued_at);

      return {
        token,
        expiresAt,
        issuedAt,
        projectId: tokenData.project?.id,
        projectName: tokenData.project?.name,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        throw new Error(`获取IAM Token失败: ${errorMsg}`);
      }
      throw new Error(`获取IAM Token失败: ${String(error)}`);
    }
  }

  /**
   * 检查Token是否有效（距离过期时间超过5分钟）
   */
  private isTokenValid(token: CachedToken): boolean {
    const now = new Date();
    const timeToExpire = token.expiresAt.getTime() - now.getTime();
    const fiveMinutes = 5 * 60 * 1000; // 5分钟的毫秒数

    return timeToExpire > fiveMinutes;
  }

  /**
   * 获取有效的Token（自动处理缓存和刷新）
   */
  private async getValidToken(): Promise<string> {
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken.token;
    }

    this.cachedToken = await this.getIamToken();

    return this.cachedToken.token;
  }

  /**
   * 通用请求方法
   */
  private async request<T = unknown>(
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    try {
      const config: AxiosRequestConfig = {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        params: options.params,
        data: options.data,
      };

      const response = await this.client.request(config);

      return {
        success: true,
        data: response.data,
        message: 'Request successful',
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          data: null,
          error: error.response?.data?.error_msg || error.response?.data?.message || error.message,
        };
      }
      return {
        success: false,
        data: null,
        error: String(error),
      };
    }
  }

  /**
   * 设置CodeArts API的基础URL
   */
  setCodeArtsBaseUrl(baseUrl: string): void {
    this.client.defaults.baseURL = baseUrl;
  }

  /**
   * 获取项目列表
   */
  async getProjects(params?: ProjectQueryParams): Promise<ApiResponse<ProjectListResponse>> {
    return this.request('/v4/projects', {
      method: 'GET',
      params: {
        offset: 0,
        limit: 10,
        ...params,
      },
    });
  }

  /**
   * 获取指定项目的详细信息
   */
  async getProjectById(projectId: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v4/projects/${projectId}`, {
      method: 'GET',
    });
  }

  /**
   * 高级查询工作项 (ListIssuesV4)
   * 根据筛选条件查询工作项
   */
  async getIssues(
    projectId: string,
    params?: ListIssuesV4Request
  ): Promise<ApiResponse<ListIssuesV4Response>> {
    return this.request(`/v4/projects/${projectId}/issues`, {
      method: 'POST',
      data: {
        offset: 0,
        limit: 100,
        query_type: 'backlog',
        ...params,
      },
    });
  }

  /**
   * 获取指定工作项的详细信息
   */
  async getIssueById(projectId: string, issueId: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v4/projects/${projectId}/issues/${issueId}`, {
      method: 'GET',
    });
  }

  /**
   * 创建工作项
   */
  async createIssue(projectId: string, issueData: unknown): Promise<ApiResponse<unknown>> {
    return this.request(`/v4/projects/${projectId}/issues`, {
      method: 'POST',
      data: issueData,
    });
  }

  /**
   * 更新工作项
   */
  async updateIssue(
    projectId: string,
    issueId: string,
    issueData: unknown
  ): Promise<ApiResponse<unknown>> {
    return this.request(`/v4/projects/${projectId}/issues/${issueId}`, {
      method: 'PUT',
      data: issueData,
    });
  }

  /**
   * 删除工作项
   */
  async deleteIssue(projectId: string, issueId: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v4/projects/${projectId}/issues/${issueId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 获取项目的迭代列表
   */
  async getIterations(
    projectId: string,
    params?: ListProjectIterationsV4Request
  ): Promise<ApiResponse<ListProjectIterationsV4Response>> {
    return this.request(`/v4/projects/${projectId}/iterations`, {
      method: 'GET',
      params: params as Record<string, unknown>,
    });
  }

  /**
   * 获取指定迭代的详细信息
   */
  async getIterationById(projectId: string, iterationId: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v4/projects/${projectId}/iterations/${iterationId}`, {
      method: 'GET',
    });
  }

  /**
   * 获取项目成员列表
   */
  async getMembers(
    projectId: string,
    params?: ProjectMemberQueryParams
  ): Promise<ApiResponse<ProjectMemberListResponse>> {
    return this.request(`/v4/projects/${projectId}/members`, {
      method: 'GET',
      params: {
        offset: 0,
        limit: 100,
        ...params,
      },
    });
  }

  /**
   * 按用户查询工时（单项目）
   */
  async showProjectWorkHours(
    projectId: string,
    params?: ShowProjectWorkHoursRequest
  ): Promise<ApiResponse<ShowProjectWorkHoursResponse>> {
    return this.request(`/v4/projects/${projectId}/work-hours`, {
      method: 'POST',
      data: {
        offset: 0,
        limit: 10,
        ...params,
      },
    });
  }

  /**
   * 获取当前Token信息（用于调试）
   */
  getTokenInfo(): CachedToken | null {
    return this.cachedToken;
  }

  /**
   * 手动刷新Token
   */
  async refreshToken(): Promise<string> {
    this.cachedToken = null;
    return this.getValidToken();
  }
}
