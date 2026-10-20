// SAMPLE DATA ONLY. Used when VITE_API_BASE_URL is not set (preview mode).
// Every item carries isMock: true so the UI can label it. Real data never comes from this file.
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export function createMockProjects() {
  return [
    { projectId: 'sample-podcast-14', name: 'Founder podcast, episode 14', thumbnail: null, duration: 3412, status: 'ready', createdAt: hoursAgo(24 * 9), updatedAt: hoursAgo(3) },
    { projectId: 'sample-biology', name: 'Biology lecture: cell division', thumbnail: null, duration: 2710, status: 'draft', createdAt: hoursAgo(24 * 5), updatedAt: hoursAgo(30) },
    { projectId: 'sample-maya', name: 'Customer interview with Maya', thumbnail: null, duration: 1486, status: 'processing', createdAt: hoursAgo(2), updatedAt: hoursAgo(1) },
    { projectId: 'sample-launch', name: 'Product launch recap', thumbnail: null, duration: 684, status: 'ready', createdAt: hoursAgo(24 * 21), updatedAt: hoursAgo(24 * 8) },
    { projectId: 'sample-travel', name: 'Travel vlog rough cut', thumbnail: null, duration: 1932, status: 'draft', createdAt: hoursAgo(24 * 14), updatedAt: hoursAgo(24 * 12) },
    { projectId: 'sample-standup', name: 'Weekly team standup', thumbnail: null, duration: 905, status: 'ready', createdAt: hoursAgo(24 * 30), updatedAt: hoursAgo(24 * 27) }
  ].map((project) => ({ ...project, isMock: true }));
}
