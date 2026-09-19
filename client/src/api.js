async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `请求失败（${response.status}）`);
    error.status = response.status;
    error.issues = body.issues || [];
    throw error;
  }
  return body;
}

export const gameApi = {
  getState: () => request('/api/game'),
  preview: (assignments) => request('/api/game/plan/preview', {
    method: 'POST',
    body: JSON.stringify({ assignments })
  }),
  advance: (assignments, expectedRevision) => request('/api/game/day/advance', {
    method: 'POST',
    body: JSON.stringify({ assignments, expectedRevision })
  }),
  reset: (seed) => request('/api/game/reset', {
    method: 'POST',
    body: JSON.stringify(seed === undefined || seed === null ? {} : { seed })
  })
};

export const restrictionApi = {
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.islandId) params.set('islandId', filters.islandId);
    if (filters.status) params.set('status', filters.status);
    const query = params.toString();
    return request(`/api/restrictions${query ? `?${query}` : ''}`);
  },
  audit: (islandId) => {
    const params = new URLSearchParams();
    if (islandId) params.set('islandId', islandId);
    const query = params.toString();
    return request(`/api/restrictions/audit${query ? `?${query}` : ''}`);
  },
  register: (input) => request('/api/restrictions', {
    method: 'POST',
    body: JSON.stringify(input)
  }),
  revoke: (ruleId, reason) => request(`/api/restrictions/${encodeURIComponent(ruleId)}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  })
};
