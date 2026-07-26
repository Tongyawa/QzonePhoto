export const UPDATE_CHECK_FEEDBACK_DURATION = 1600

const FEEDBACK_BY_TYPE = {
  latest: { text: '已是最新', tone: 'success', duration: UPDATE_CHECK_FEEDBACK_DURATION },
  slow: { text: '检查较慢', tone: 'info', duration: 2400 },
  error: { text: '检查失败', tone: 'error', duration: UPDATE_CHECK_FEEDBACK_DURATION }
}

export function getUpdateCheckFeedback(type) {
  return FEEDBACK_BY_TYPE[type] || null
}
