import { Github } from 'lucide-react';

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <span>Created by: Jude Iwelumo</span>
      <span>For Carpenters Family</span>
      <a href="https://github.com/mosignorjude" target="_blank" rel="noreferrer" aria-label="Github: @mosignorjude">
        <Github size={13} aria-hidden="true" />
        <span>Github: @mosignorjude</span>
      </a>
    </footer>
  );
}
