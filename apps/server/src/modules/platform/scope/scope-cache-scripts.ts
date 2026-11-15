/** 版本读取和数据操作在 Redis 中原子执行，旧计算不能跨过失效屏障回填。 */
const current = `
  local current = (redis.call('GET', KEYS[1]) or '0') .. ':' .. (redis.call('GET', KEYS[2]) or '0')
  if current ~= ARGV[1] then return nil end
`;
const entry = `
  ${current}
  local raw = redis.call('GET', KEYS[3])
  if not raw then return nil end
  local ok, value = pcall(cjson.decode, raw)
  if not ok or type(value) ~= 'table' or value.revision ~= ARGV[1] or type(value.scope) ~= 'table' then return nil end
  if value.storage == 'set' and redis.call('SCARD', KEYS[4]) ~= value.count then return nil end
`;
export const readScope = `${entry}
  if value.storage == 'set' then return {raw, redis.call('SMEMBERS', KEYS[4])} end
  return {raw, {}}
`;
export const containsSchool = `${entry}
  if value.scope.kind == 'all-schools' then return 2 end
  if value.scope.kind ~= 'schools' then return 0 end
  if value.storage == 'set' then return redis.call('SISMEMBER', KEYS[4], ARGV[2]) end
  if type(value.scope.schoolIds) ~= 'table' then return nil end
  for _, id in ipairs(value.scope.schoolIds) do
    if id == ARGV[2] then return 1 end
  end
  return 0
`;
export const writeScope = `${current}
  redis.call('DEL', KEYS[4])
  if #ARGV > 2 then
    for i = 3, #ARGV do redis.call('SADD', KEYS[4], ARGV[i]) end
    redis.call('EXPIRE', KEYS[4], 600)
  end
  redis.call('SET', KEYS[3], ARGV[2], 'EX', 600)
  return 1
`;
