import { CsvImport } from '@/components/csv-import';

export default function UploadPage() {
  return <><section className="loop-page-heading"><p className="text-sm font-semibold text-blue-600">DATASET UPLOAD</p><h1>Add customer feedback from any CSV.</h1><p>Rename the dataset and select the CSV column that contains the main customer reviews.</p></section><CsvImport /></>;
}
