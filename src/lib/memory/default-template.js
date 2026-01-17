/**
 * Default Memory Template
 * 迁移自: src/scripts/memory/default-template.js
 */

export const DEFAULT_MEMORY_TEMPLATE = {
  meta: {
    id: 'default-v1',
    name: '通用记忆模板',
    version: '1.0.2',
    author: '官方',
    description: '适用于常规角色扮演与日常聊天的基础记忆表格模板。',
    tags: ['通用', '角色扮演'],
  },
  tables: [
    {
      id: 'user_profile',
      name: '用户档案',
      scope: 'global',
      maxRows: 1,
      columns: [
        { id: 'nickname', name: '称呼', type: 'text' },
        { id: 'gender', name: '性别', type: 'select', options: ['男', '女', '未知'] },
        { id: 'personality', name: '性格（MBTI等）', type: 'multiline' },
        { id: 'likes', name: '喜好', type: 'multiline' },
        { id: 'notes', name: '其他信息', type: 'multiline' },
      ],
    },
    {
      id: 'character_profile',
      name: '角色档案',
      scope: 'contact',
      maxRows: 1,
      columns: [
        { id: 'personality', name: '性格（MBTI等）', type: 'multiline' },
        { id: 'likes', name: '喜好', type: 'multiline' },
        { id: 'taboos', name: '雷区/禁忌', type: 'multiline' },
        { id: 'notes', name: '其他信息', type: 'multiline' },
      ],
    },
    {
      id: 'important_people',
      name: '重要人物表',
      scope: 'group',
      columns: [
        { id: 'name', name: '姓名', type: 'text' },
        { id: 'age_gender', name: '性别/年龄', type: 'text' },
        { id: 'appearance', name: '外貌特征', type: 'multiline' },
        { id: 'items', name: '重要物品', type: 'multiline' },
        { id: 'present', name: '是否在场', type: 'select', options: ['是', '否'] },
        { id: 'notes', name: '过往经历/状态', type: 'multiline' },
      ],
    },
    {
      id: 'relationship',
      name: '关系记录',
      scope: 'contact',
      columns: [
        { id: 'relation', name: '关系', type: 'text' },
        { id: 'impression', name: '对方印象', type: 'multiline' },
        { id: 'names', name: '互相称呼', type: 'text' },
        { id: 'stage', name: '关系阶段', type: 'text' },
      ],
    },
    {
      id: 'events',
      name: '重要事件',
      scope: 'contact',
      columns: [
        { id: 'time', name: '时间', type: 'text' },
        { id: 'description', name: '事件描述', type: 'multiline' },
        { id: 'impact', name: '影响', type: 'multiline' },
        { id: 'importance', name: '重要程度', type: 'select', options: ['低', '中', '高', '极高'] },
      ],
    },
    {
      id: 'items',
      name: '重要物品',
      scope: 'contact',
      columns: [
        { id: 'name', name: '物品名', type: 'text' },
        { id: 'description', name: '描述', type: 'multiline' },
        { id: 'owner', name: '持有者', type: 'text' },
        { id: 'source', name: '来源', type: 'text' },
      ],
    },
    {
      id: 'chat_summary',
      name: '私聊摘要',
      scope: 'contact',
      columns: [
        { id: 'time', name: '时间/轮次', type: 'text' },
        { id: 'summary', name: '摘要', type: 'multiline' },
      ],
    },
    {
      id: 'group_summary',
      name: '群聊摘要',
      scope: 'group',
      columns: [
        { id: 'time', name: '时间/轮次', type: 'text' },
        { id: 'summary', name: '摘要', type: 'multiline' },
      ],
    },
  ],
  injection: {
    template: '{{tableData}}',
    position: 'after_persona',
    wrapper: '<memories>\n{{tableData}}\n</memories>',
  },
};
