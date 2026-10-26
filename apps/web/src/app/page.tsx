import { RunList } from '@/components/RunList';
import { UploadForm } from '@/components/UploadForm';

export default function Home() {
  return (
    <div className="home">
      <UploadForm />
      <RunList />
    </div>
  );
}
