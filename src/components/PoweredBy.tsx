import carpentersLogo from '../assets/cf-logo-full-white-black.png';

export default function PoweredBy() {
  return (
    <div className="powered-by">
      <span>Powered by:</span>
      <div className="powered-by-brand">
        <img src={carpentersLogo} alt="Carpenters Family logo" />
      </div>
    </div>
  );
}
