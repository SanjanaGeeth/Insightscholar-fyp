import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';
const api = axios.create({ baseURL: API_BASE_URL });

export const searchPapers = async (query, topK = 10, filters = {}, model = 'specter', rankingMethod = 'hybrid', sortBy = 'relevance', fieldsOfStudy = null, useLiveSource = true) => {
  try {
    const payload = {
      query,
      top_k: topK,
      filters,
      model,
      ranking_method: rankingMethod,
      sort_by: sortBy,
      use_live_source: useLiveSource,
    };
    if (fieldsOfStudy && fieldsOfStudy.length > 0) {
      payload.fields_of_study = fieldsOfStudy;
    }
    const response = await api.post('/search', payload);
    return response.data;
  } catch (error) {
    console.error('Search error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to search papers'
    );
  }
};

export const getPaper = async (paperId) => {
  try {
    const response = await api.get(`/paper/${paperId}`);
    return response.data;
  } catch (error) {
    console.error('Get paper error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to get paper'
    );
  }
};

export const getExplanation = async (paperId, query, method = 'keywords') => {
  try {
    const response = await api.post('/explain', {
      paper_id: paperId,
      query,
      method,
    });
    return response.data;
  } catch (error) {
    console.error('Explanation error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to get explanation'
    );
  }
};

export const getHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    return null;
  }
};

export const getStats = async () => {
  try {
    const response = await api.get('/stats');
    return response.data;
  } catch (error) {
    console.error('Stats error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to get statistics'
    );
  }
};

export const addBookmark = async (paperId, query = '', notes = '') => {
  try {
    const response = await api.post('/bookmarks', {
      paper_id: paperId,
      query,
      notes,
    });
    return response.data;
  } catch (error) {
    console.error('Add bookmark error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to add bookmark'
    );
  }
};

export const getBookmarks = async () => {
  try {
    const response = await api.get('/bookmarks');
    return response.data;
  } catch (error) {
    console.error('Get bookmarks error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to get bookmarks'
    );
  }
};

export const removeBookmark = async (paperId) => {
  try {
    const response = await api.delete(`/bookmarks/${paperId}`);
    return response.data;
  } catch (error) {
    console.error('Remove bookmark error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to remove bookmark'
    );
  }
};

export const getSearchHistory = async (limit = 50) => {
  try {
    const response = await api.get(`/history?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error('History error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to get search history'
    );
  }
};

export const deleteSearchHistoryEntry = async (id) => {
  try {
    const response = await api.delete(`/history/${id}`);
    return response.data;
  } catch (error) {
    console.error('Delete history entry error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to delete history entry'
    );
  }
};

export const clearSearchHistory = async () => {
  try {
    const response = await api.delete('/history');
    return response.data;
  } catch (error) {
    console.error('Clear history error:', error);
    throw new Error(
      error.response?.data?.detail ||
      error.message ||
      'Failed to clear search history'
    );
  }
};
