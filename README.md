# Resume Page

一个使用 TypeScript + YAML 配置驱动的在线简历项目。

## 功能特性

- 基于 `resume.yml` 渲染简历内容
- 模块可选、可排序（教育、技能、项目、工作、荣誉、开源等）
- 内容支持 Markdown
- 联系方式脱敏展示与点击交互
  - 微信：点击复制
  - 电话：点击拨号
  - 邮箱：点击发邮件
- 移动端适配
- 导出 A4 PDF（非浏览器打印，使用前端库导出，自动分页）
- 跟随系统亮/暗模式切换主题

## 环境要求

- Node.js 18+
- npm 9+

## 本地搭建

```bash
npm install
npm run dev
```

开发服务启动后，默认地址：

- [http://localhost:5173](http://localhost:5173)

## 构建与预览

```bash
npm run build
npm run preview
```

## 配置说明

项目默认读取根目录 `resume.yml`。

也可以通过 URL 指定配置文件，例如：

```text
http://localhost:5173/?config=/resume.yml
```

### 主要配置节点

- `site`: 站点标题、主题色、模块顺序、模块名称
- `basic`: 姓名、职位、联系方式、链接等基本信息
- `education`
- `skills`
- `work`
- `projects`
- `profile`
- `honors`
- `openSource`

## 项目结构

```text
resume-page/
  public/
    favicon.svg
    iconfont/
    icons/
  src/
    main.ts
    styles.css
  resume.yml
  index.html
  package.json
  tsconfig.json
```

## 常用脚本

- `npm run dev`: 启动开发环境
- `npm run build`: 构建生产包
- `npm run preview`: 本地预览生产包
