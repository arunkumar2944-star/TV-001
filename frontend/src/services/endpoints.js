/**
 * Typed-ish wrappers around every API route the newsroom uses.
 * Pages import from here rather than building URLs by hand.
 */

import { api } from './apiClient.js';

// ------------------------------------------------------------------- auth

export const authApi = {
  csrf: () => api.get('/auth/csrf'),
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: (options) => api.get('/auth/me', options),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// ------------------------------------------------------------------ users

export const userApi = {
  list: (params, options) =>
    api.get('/users', {
      ...options,
      params,
    }),

  get: (id) =>
    api.get(`/users/${id}`),

  create: (payload) =>
    api.post('/internal/users', payload),

  update: (id, payload) =>
    api.patch(`/users/${id}`, payload),

  setStatus: (id, isActive) =>
    api.patch(
      `/users/${id}/status`,
      {
        isActive,
      }
    ),

  changePassword: (newPassword) =>
    api.post(
      '/users/change-password',
      {
        newPassword,
      }
    ),
};

// -------------------------------------------------------------- dashboard

export const dashboardApi = {
  summary: (options) => api.get('/dashboard/summary', options),
  publishing: (params, options) => api.get('/dashboard/publishing', { ...options, params }),
  activity: (options) => api.get('/dashboard/activity', options),
  audit: (params, options) => api.get('/dashboard/audit', { ...options, params }),
};

// ------------------------------------------------------------------- news

export const newsApi = {
  options: (options) => api.get('/news/options', options),
  list: (params, options) => api.get('/news', { ...options, params }),
  get: (id, options) => api.get(`/news/${id}`, options),
  create: (payload) => api.post('/news', payload),
  update: (id, payload) => api.patch(`/news/${id}`, payload),
  remove: (id) => api.delete(`/news/${id}`),
  archive: (id) => api.post(`/news/${id}/archive`),
  readiness: (id, options) => api.get(`/news/${id}/readiness`, options),
  submitForApproval: (id) => api.post(`/news/${id}/submit-approval`),
  approve: (id, note) => api.post(`/news/${id}/approve`, { note: note || null }),
  reject: (id, reason) => api.post(`/news/${id}/reject`, { reason }),
  approvals: (id) => api.get(`/news/${id}/approvals`),
  publish: (id) => api.post(`/news/${id}/publish`),
};

// ------------------------------------------------------------------ media

export const mediaApi = {
  list: (newsId, options) => api.get(`/news/${newsId}/media`, options),
  upload: (newsId, formData) => api.upload(`/news/${newsId}/media`, formData),
  reorder: (newsId, order) => api.patch(`/news/${newsId}/media/order`, { order }),
  remove: (mediaId) => api.delete(`/media/${mediaId}`),
};

// --------------------------------------------------------------- approval

export const approvalApi = {
  list: (params, options) => api.get('/approvals', { ...options, params }),
};

// -------------------------------------------------------------- publishing

export const publishApi = {
  ready: (params, options) => api.get('/publish', { ...options, params: { ...params, view: 'ready' } }),
  history: (params, options) => api.get('/publish', { ...options, params: { ...params, view: 'history' } }),
  job: (jobId, options) => api.get(`/publish/${jobId}`, options),
  newsDetail: (newsId, options) => api.get(`/publish/news/${newsId}`, options),
  retry: (jobId, platforms) => api.post(`/publish/${jobId}/retry`, { platforms: platforms || undefined }),
  integration: (options) => api.get('/publish/integration', options),
};

// -------------------------------------------------------------- platforms

export const platformApi = {
  list: (options) => api.get('/platforms', options),
};

export const healthApi = {
  check: (options) => api.get('/health', options),
};
