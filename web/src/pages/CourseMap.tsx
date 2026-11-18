import { useParams } from 'react-router-dom';
import { CoursePath } from '../learn/CoursePath';

/**
 * A course's lesson path on its own page (/app/learn/course/:courseId), under a header with the way back, the course
 * name and progress, the other courses and the continue button. Learn shows the same path without the header.
 */
export function CourseMap(): React.JSX.Element {
  const { courseId = '' } = useParams();
  return (
    <div className="container container-narrow">
      {/* Each course is its own path: its scroll, card and way back start afresh. */}
      <CoursePath key={courseId} courseId={courseId} />
    </div>
  );
}
