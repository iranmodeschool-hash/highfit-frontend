import DatePicker from 'react-multi-date-picker';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import gregorian from 'react-date-object/calendars/gregorian';
import persianFa from 'react-date-object/locales/persian_fa';
import gregorianEn from 'react-date-object/locales/gregorian_en';


type Props = { value: string; onChange: (iso: string) => void; testId: string; className?: string };
export default function JalaliDateInput({ value, onChange, testId, className = '' }: Props) {
  const selected = value ? new DateObject({ date: value, format: 'YYYY-MM-DD', calendar: gregorian, locale: gregorianEn }).convert(persian, persianFa) : undefined;
  return <DatePicker
    value={selected}
    onChange={date => {
      if (!date || Array.isArray(date)) return;
      onChange(date.convert(gregorian, gregorianEn).format('YYYY-MM-DD'));
    }}
    calendar={persian}
    locale={persianFa}
    format="YYYY/MM/DD"
    calendarPosition="bottom-right"
    containerClassName="w-full"
    render={(display, openCalendar) => <button type="button" data-testid={testId} aria-label="انتخاب تاریخ شمسی" onClick={openCalendar} className={`${className} text-right`}>{display || 'انتخاب تاریخ'}</button>} 
  />;
}
