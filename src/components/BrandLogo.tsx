import raveDesign from '../assets/issele-uku-rave-design.png';

type Props = { className?: string };

export default function BrandLogo({ className = '' }: Props) {
  return <img className={`brand-logo ${className}`.trim()} src={raveDesign} alt="Issele Uku Rave logo" />;
}
