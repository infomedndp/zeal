import React from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  updateDoc,
  onSnapshot,
  enableNetwork,
  disableNetwork
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { Company, CompanyData } from '../types/company';
import { v4 as uuidv4 } from 'uuid';

interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  companyData: CompanyData;
  isOffline: boolean;
  loading: boolean;
  error: string | null;
  addCompany: (name: string) => Promise<void>;
  selectCompany: (id: string) => Promise<void>;
  updateCompanyData: (data: Partial<CompanyData & { id?: string }>) => Promise<void>;
  updateCompanyInfo: (info: Partial<Company>) => Promise<void>;
}

const CompanyContext = React.createContext<CompanyContextType | null>(null);

// Default Uncategorized account that should always exist
const defaultUncategorizedAccount = {
  id: 'uncategorized-default',
  accountNumber: '00000',
  accountName: 'Uncategorized',
  accountType: 'Other',
  category: 'Other',
  description: 'Default account for uncategorized transactions',
  balance: 0,
  isActive: true,
  version: 'default',
  subtype: null
};

const initialCompanyData: CompanyData = {
  transactions: [],
  accounts: [defaultUncategorizedAccount],
  categoryRules: [],
  customers: [],
  vendors: [],
  invoices: [],
  bankAccounts: [], // Initialize empty bank accounts array
  payroll: {
    employees: [],
    contractors: [],
    payrollRuns: []
  },
  workManagement: {
    tasks: [],
    documents: [],
    overview: {}
  },
  tools: {
    zealCheck: {
      documents: [],
      webhookUrl: ''
    }
  }
};

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [companyData, setCompanyData] = React.useState(initialCompanyData);
  const [isOffline, setIsOffline] = React.useState(!window.navigator.onLine);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [unsubscribeCompanyData, setUnsubscribeCompanyData] = React.useState<(() => void) | null>(null);

  // Network status monitoring
  React.useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      await enableNetwork(db);
    };

    const handleOffline = async () => {
      setIsOffline(true);
      await disableNetwork(db);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Companies subscription
  React.useEffect(() => {
    if (!user) {
      setCompanies([]);
      setSelectedId(null);
      setCompanyData(initialCompanyData);
      setLoading(false);
      return;
    }

    setLoading(true);
    const companiesRef = collection(db, 'companies');
    const q = query(companiesRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const companiesList: Company[] = [];
        snapshot.forEach((doc) => {
          companiesList.push({ id: doc.id, ...doc.data() } as Company);
        });
        setCompanies(companiesList);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching companies:', error);
        setError('Failed to load companies');
        setLoading(false);
        if (!isOffline) {
          setCompanies([]);
        }
      }
    );

    return () => unsubscribe();
  }, [user, isOffline]);

  // Company data subscription
  React.useEffect(() => {
    if (unsubscribeCompanyData) {
      unsubscribeCompanyData();
    }

    if (!selectedId) {
      setCompanyData(initialCompanyData);
      setLoading(false);
      return;
    }

    setLoading(true);
    const companyRef = doc(db, 'companies', selectedId);
    
    const unsubscribe = onSnapshot(companyRef, 
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          
          // Ensure Uncategorized account always exists
          const accounts = Array.isArray(data.accounts) ? data.accounts : [];
          const hasUncategorized = accounts.some(acc => acc.accountNumber === '00000');
          const finalAccounts = hasUncategorized ? accounts : [defaultUncategorizedAccount, ...accounts];

          // Ensure bankAccounts array exists
          const bankAccounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];

          // Ensure workManagement is properly initialized
          const workManagement = {
            tasks: Array.isArray(data.workManagement?.tasks) ? data.workManagement.tasks : [],
            documents: Array.isArray(data.workManagement?.documents) ? data.workManagement.documents : [],
            overview: data.workManagement?.overview || {}
          };

          const tools = {
            zealCheck: data.tools?.zealCheck || {
              documents: [],
              webhookUrl: ''
            }
          };

          setCompanyData({
            transactions: Array.isArray(data.transactions) ? data.transactions : [],
            accounts: finalAccounts,
            categoryRules: Array.isArray(data.categoryRules) ? data.categoryRules : [],
            customers: Array.isArray(data.customers) ? data.customers : [],
            vendors: Array.isArray(data.vendors) ? data.vendors : [],
            invoices: Array.isArray(data.invoices) ? data.invoices : [],
            bankAccounts: bankAccounts,
            payroll: {
              employees: Array.isArray(data.payroll?.employees) ? data.payroll.employees : [],
              contractors: Array.isArray(data.payroll?.contractors) ? data.payroll.contractors : [],
              payrollRuns: Array.isArray(data.payroll?.payrollRuns) ? data.payroll.payrollRuns : []
            },
            workManagement,
            tools,
          });
          setError(null);
        } else {
          setCompanyData({
            ...initialCompanyData,
            workManagement: {
              tasks: [],
              documents: [],
              overview: {}
            },
            tools: {
              zealCheck: {
                documents: [],
                webhookUrl: ''
              }
            }
          });
          setError('Company not found');
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching company data:', error);
        setError('Failed to load company data');
        setCompanyData(initialCompanyData);
        setLoading(false);
      }
    );

    setUnsubscribeCompanyData(() => unsubscribe);
    return () => unsubscribe();
  }, [selectedId]);

  const addCompany = async (name: string) => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const companyId = `${name.toLowerCase().replace(/\s+/g, '-')}-${uuidv4().split('-')[0]}`;
      const newCompany: Company = {
        id: companyId,
        userId: user.uid,
        name,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        bankAccounts: [] // Initialize empty bank accounts array
      };

      const companyRef = doc(db, 'companies', companyId);
      await setDoc(companyRef, {
        ...newCompany,
        ...initialCompanyData
      });

      setCompanies(prev => [...prev, newCompany]);
      return companyId;
    } catch (error) {
      console.error('Error adding company:', error);
      setError('Failed to add company');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const selectCompany = async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      if (id === '') {
        setSelectedId(null);
        setCompanyData(initialCompanyData);
        setLoading(false);
        return;
      }

      const companyRef = doc(db, 'companies', id);
      const companyDoc = await getDoc(companyRef);

      if (!companyDoc.exists()) {
        throw new Error('Company not found');
      }

      await updateDoc(companyRef, {
        lastAccessed: new Date().toISOString()
      });

      setCompanies(prev =>
        prev.map(company =>
          company.id === id
            ? { ...company, lastAccessed: new Date().toISOString() }
            : company
        )
      );

      setSelectedId(id);
    } catch (error) {
      console.error('Error selecting company:', error);
      setError('Failed to select company');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateCompanyData = async (data: Partial<CompanyData & { id?: string }>) => {
    const companyId = data.id || selectedId;
    if (!companyId) {
      setError('No company selected');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const companyRef = doc(db, 'companies', companyId);
      const companyDoc = await getDoc(companyRef);
      
      if (companyDoc.exists()) {
        const currentData = companyDoc.data();
        
        // Ensure Uncategorized account is preserved
        let updatedAccounts = data.accounts;
        if (Array.isArray(updatedAccounts)) {
          const hasUncategorized = updatedAccounts.some(acc => acc.accountNumber === '00000');
          if (!hasUncategorized) {
            updatedAccounts = [defaultUncategorizedAccount, ...updatedAccounts];
          }
        }

        // Ensure bankAccounts array exists
        const bankAccounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : currentData.bankAccounts || [];

        const updatedData = {
          ...currentData,
          ...data,
          accounts: updatedAccounts || currentData.accounts,
          bankAccounts: bankAccounts
        };

        // Remove the id from the data before updating
        const { id, ...dataToUpdate } = updatedData;
        await updateDoc(companyRef, dataToUpdate);
      }
    } catch (error) {
      console.error('Error updating company data:', error);
      setError('Failed to update company data');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateCompanyInfo = async (info: Partial<Company>) => {
    if (!selectedId) {
      setError('No company selected');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const companyRef = doc(db, 'companies', selectedId);
      await updateDoc(companyRef, info);
    } catch (error) {
      console.error('Error updating company info:', error);
      setError('Failed to update company info');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const selectedCompany = React.useMemo(
    () => companies.find(c => c.id === selectedId) || null,
    [companies, selectedId]
  );

  const value = {
    companies,
    selectedCompany,
    companyData,
    isOffline,
    loading,
    error,
    addCompany,
    selectCompany,
    updateCompanyData,
    updateCompanyInfo
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = React.useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
