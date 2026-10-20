import { initialsOf } from '../../utils/format.js';

export default function Avatar({ user, size = 36 }) {
  return (
    <span className="avatar" style={{ '--s': `${size}px` }} aria-hidden="true">
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initialsOf(user)}
    </span>
  );
}
