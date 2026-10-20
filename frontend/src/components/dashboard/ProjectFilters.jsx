const FILTERS = [
  { id: 'all', label: 'All Projects' },
  { id: 'draft', label: 'Drafts' },
  { id: 'processing', label: 'Processing' },
  { id: 'ready', label: 'Completed' }
];

export default function ProjectFilters({ filter, onFilter, sort, onSort, counts }) {
  return (
    <div className="filters">
      <div className="chips-row" role="group" aria-label="Filter projects by status">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={`fchip${filter === item.id ? ' on' : ''}`} aria-pressed={filter === item.id} onClick={() => onFilter(item.id)}>
            {item.label}<span className="count">{counts[item.id]}</span>
          </button>
        ))}
      </div>
      <div className="sort">
        <label htmlFor="project-sort">Sort by</label>
        <select id="project-sort" value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="recent">Recently Edited</option>
          <option value="newest">Newest</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
    </div>
  );
}
