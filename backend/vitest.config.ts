import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // 每个测试文件在独立子进程运行，各自拥有独立的 :memory: SQLite 连接
    pool: 'forks',

    // 测试运行前设置环境变量，确保 db/client.ts 使用内存数据库
    env: {
      DB_PATH: ':memory:',
    },

    // 排除用 node:test 格式写的旧测试文件（与 Vitest 格式不兼容）
    include: ['src/**/*.test.ts'],
    exclude: ['src/services/semantic.test.ts'],

    // CI 同时输出 JUnit XML，供 GitHub Actions Test Summary 展示
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: './test-results/junit.xml' },

    coverage: {
      provider: 'v8',
      // 终端摘要 + HTML 可视化报告 + lcov（可接入 CI/IDE 插件）
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // 只统计业务代码
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',          // 启动入口，只有 listen
        'src/**/*.test.ts',      // 测试文件本身
        'src/types/**',          // 纯类型定义
        'src/services/semantic.test.ts', // 旧测试（node:test 格式）
      ],
      // 覆盖率红线：仅统计已测试模块，随着测试增加逐步上调此值
      // 当前阶段（仅覆盖 students/quiz/tasks）：约 25%
      // 建议每完成一批路由测试后将对应数值上调 10-15%
      thresholds: {
        lines: 20,
        functions: 18,
      },
    },
  },
})
