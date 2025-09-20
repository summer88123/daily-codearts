import dotenv from 'dotenv';
import { BusinessService } from './services/business.service';
import { HuaweiCloudConfig } from './types';

// 加载环境变量
dotenv.config();

/**
 * 将迭代状态代码转换为可读文本
 */
function getIterationStatusText(status: string): string {
  switch (status) {
    case '0':
      return '未启动';
    case '1':
      return '进行中';
    case '2':
      return '已结束';
    case 'open':
      return '开放（老数据）';
    default:
      return `未知状态(${status})`;
  }
}

async function main() {
  try {
    console.log('开始统计日报...');

    // 从环境变量获取项目ID和角色ID
    const projectId = process.env.PROJECT_ID;
    const roleId = process.env.ROLE_ID;

    if (!projectId) {
      console.error('错误: 未设置环境变量 PROJECT_ID');
      process.exit(1);
    }

    if (!roleId) {
      console.error('错误: 未设置环境变量 ROLE_ID');
      process.exit(1);
    }

    console.log(`项目ID: ${projectId}`);
    console.log(`角色ID: ${roleId}`);

    // 初始化华为云CodeArts API服务
    const config: HuaweiCloudConfig = {
      iamEndpoint:
        process.env.HUAWEI_CLOUD_IAM_ENDPOINT || 'https://iam.cn-north-1.myhuaweicloud.com',
      endpoint:
        process.env.CODEARTS_BASE_URL || 'https://projectman-ext.cn-north-1.myhuaweicloud.cn',
      username: process.env.HUAWEI_CLOUD_USERNAME || '',
      password: process.env.HUAWEI_CLOUD_PASSWORD || '',
      domainName: process.env.HUAWEI_CLOUD_DOMAIN || '',
    };

    const businessService = new BusinessService(config);

    // 获取指定角色的成员列表
    console.log(`正在获取项目ID为 ${projectId}，角色ID为 ${roleId} 的成员列表...`);

    const roleMembers = await businessService.getMembersByRoleId(projectId, parseInt(roleId));

    // 获取指定角色用户的工时数据
    console.log(`\n正在获取角色ID为 ${roleId} 的用户工时数据...`);

    if (roleMembers.length === 0) {
      console.log('未找到指定角色的用户，跳过工时查询');
    } else {
      // 提取指定角色用户的ID列表
      const roleUserIds = roleMembers.map((member) => member.user_id);
      console.log(`找到 ${roleUserIds.length} 个指定角色的用户，开始查询工时...`);

      // 使用新的工时统计方法查询指定日期的工时
      const targetDate = '2025-09-19'; // 示例日期，可以从环境变量获取
      console.log(`\n正在统计 ${targetDate} 的工时数据...`);

      try {
        const dailyStats = await businessService.getDailyWorkHourStats(
          projectId,
          roleUserIds,
          targetDate
        );

        console.log(`\n${dailyStats.date} 工时统计结果:`);
        console.log('='.repeat(50));
        console.log(`   总工时: ${dailyStats.totalHours} 小时`);
        console.log(`   工时条目数: ${dailyStats.totalEntries} 条`);

        // 提取当天有工时记录的工作项ID
        const activeIssueIds = new Set<number>();
        dailyStats.userStats.forEach((userStat) => {
          userStat.workHours.forEach((workHour) => {
            activeIssueIds.add(workHour.issue_id);
          });
        });

        console.log(`\n当天有进展的工作项数量: ${activeIssueIds.size} 个`);

        // 查询指定迭代的任务和故事类型工作项
        const targetIterationId = 21734970; // V2510迭代

        console.log(`\n正在查询迭代ID为 ${targetIterationId} 中指定角色的任务和故事...`);
        const issues = await businessService.getWorkloadByIterationAndUsers(
          projectId,
          targetIterationId,
          roleUserIds
        );

        // 过滤出当天有进展的工作项
        const activeIssues = issues.filter((issue) => activeIssueIds.has(issue.id));

        console.log('='.repeat(80));

        if (activeIssues.length === 0) {
          console.log('当天没有工作项有进展');
        } else {
          // 显示当天有进展的工作项详情
          activeIssues.forEach((issue, index) => {
            console.log(`${index + 1}. [${issue.tracker.name}] ${issue.name}`);
            console.log(`   状态: ${issue.status.name}`);
            console.log(`   预计工时: ${issue.expected_work_hours || 0} 小时`);
            console.log(`   实际工时: ${issue.actual_work_hours || 0} 小时`);

            // 显示该工作项当天的工时详情
            const issueWorkHours = dailyStats.userStats
              .flatMap((userStat) => userStat.workHours)
              .filter((workHour) => workHour.issue_id === issue.id);

            if (issueWorkHours.length > 0) {
              console.log(`   当天工时记录:`);
              issueWorkHours.forEach((workHour) => {
                console.log(
                  `     - ${workHour.nick_name}: ${workHour.work_hours_num}小时 (${workHour.summary})`
                );
              });
            }
            console.log('');
          });
        }

        // 计算并显示整体进度统计
        if (issues.length > 0) {
          const overallProgressStats = businessService.calculateWorkProgress(issues);

          console.log('\n' + '='.repeat(80));
          console.log('整体工作项统计结果:');
          console.log(`   任务总数: ${overallProgressStats.totalCount} 个`);
          console.log(`   预计工时总和: ${overallProgressStats.totalExpectedHours} 小时`);
          console.log(`   实际工时总和: ${overallProgressStats.totalActualHours} 小时`);
          console.log(`   工时完成率: ${overallProgressStats.overallCompletionRate}%`);
        }
      } catch (error) {
        console.error('工时统计查询失败:', error);
      }
    }
  } catch (error) {
    console.error('执行过程中发生错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行main函数
if (require.main === module) {
  main();
}

// 导出API服务和类型定义
export { ApiService } from './services/api.service';
export { BusinessService } from './services/business.service';
export type {
  UserWorkHourStats,
  UserWorkStats,
  WorkHourStats,
  WorkProgressStats,
} from './services/business.service';
export * from './types';
