// Person.jsx — a person, coloured by the model they run on.

export default function Person({ family = 'unknown', state = 'idle', size = 40 }) {
  return (
    <svg
      className={`person tone-${family} person-${state}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <circle className="person-halo" cx="20" cy="20" r="19" />
      <circle className="person-head" cx="20" cy="15" r="6.5" />
      <path className="person-body" d="M8.5 34c0-7 5-11 11.5-11s11.5 4 11.5 11z" />
    </svg>
  );
}
