export const normalizeQzoneUin = (uin) => String(uin || '').replace(/^o/, '')

// `Uin` 来自已登录 Cookie，是当前会话唯一可信的账号标识；个人资料是独立接口的
// 异步结果，可能在账号切换后暂时滞后，不能用来决定请求哪个空间。
export const resolveSelfQzoneUin = (userStore) =>
  normalizeQzoneUin(userStore?.Uin || userStore?.userInfo?.uin)

export const resolveQzoneHostUin = (hostUinOverride, userStore) =>
  normalizeQzoneUin(hostUinOverride || resolveSelfQzoneUin(userStore))
